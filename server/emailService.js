import nodemailer from 'nodemailer';

// --- CONFIGURATION ---
// TODO: Replace with environment variables or secure configuration
const EMAIL_CONFIG = {
    service: 'gmail', // or your SMTP provider
    auth: {
        user: 'your-email@gmail.com', // PLACEHOLDER
        pass: 'your-app-password'      // PLACEHOLDER
    }
};

const transporter = nodemailer.createTransport(EMAIL_CONFIG);

/**
 * Generates an ICS file content string
 * @param {Object} meeting 
 * @returns {string} ICS content
 */
const generateICS = (meeting) => {
    // Format dates for ICS (YYYYMMDDTHHmmSSZ)
    // meeting.date is YYYY-MM-DD
    // meeting.time is "HH:mm - HH:mm"

    // Safety check for time format
    const timeParts = meeting.time.split(' - ');
    if (timeParts.length < 2) return '';

    const [startTimeStr, endTimeStr] = timeParts;

    const formatICSDate = (dateStr, timeStr) => {
        if (!timeStr) return '';
        // Combine date AND time properly
        // Assume dateStr is 'YYYY-MM-DD' and timeStr is 'HH:mm'
        // Construct 'YYYY-MM-DDTHH:mm:00'

        // Remove spaces and validate
        const cleanTime = timeStr.trim();
        const dtString = `${dateStr}T${cleanTime}:00`;
        const dt = new Date(dtString);

        if (isNaN(dt.getTime())) return ''; // Invalid date

        // Return YYYYMMDDTHHMMSSZ
        return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const start = formatICSDate(meeting.date, startTimeStr);
    const end = formatICSDate(meeting.date, endTimeStr);
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const location = meeting.type === 'Online' ? (meeting.meetLink || 'Online') : (meeting.location || 'TBA');

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//LMS Nusa//Meeting//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${meeting.id}@lms.nusa.net.id
DTSTAMP:${now}
DTSTART:${start}
DTEND:${end}
SUMMARY:${meeting.title}
DESCRIPTION:${meeting.description || 'No description'}
LOCATION:${location}
STATUS:CONFIRMED
ORGANIZER;CN=${meeting.host}:mailto:${EMAIL_CONFIG.auth.user}
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');
};

/**
 * Sends meeting invitation emails
 * @param {Object} meeting The meeting object
 * @param {string[]} recipientEmails Array of email addresses
 */
export const sendMeetingInvite = async (meeting, recipientEmails) => {
    if (!recipientEmails || recipientEmails.length === 0) return;

    // Filter valid emails
    const validEmails = recipientEmails.filter(e => e && e.includes('@'));
    if (validEmails.length === 0) return;

    const icsContent = generateICS(meeting);


    let googleCalendarUrl = '#';
    try {
        const timeParts = meeting.time.split(' - ');
        if (timeParts.length >= 2) {
            const [start, end] = timeParts;
            const formatGCal = (dStr, tStr) => {
                const dt = new Date(`${dStr}T${tStr.trim()}`);
                return !isNaN(dt.getTime()) ? dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z' : '';
            };

            const gCalStart = formatGCal(meeting.date, start);
            const gCalEnd = formatGCal(meeting.date, end);

            if (gCalStart && gCalEnd) {
                const location = meeting.type === 'Online' ? (meeting.meetLink || 'Online') : (meeting.location || 'TBA');
                googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meeting.title)}&details=${encodeURIComponent(meeting.description || '')}&location=${encodeURIComponent(location)}&dates=${gCalStart}/${gCalEnd}`;
            }
        }
    } catch (e) {
        console.error("Error generating Google Calendar link for email", e);
    }

    const mailOptions = () => ({
        from: `"LMS Nusa" <${EMAIL_CONFIG.auth.user}>`,
        to: validEmails.join(', '),
        subject: `Invitation: ${meeting.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0;">📅 Internal Event Invitation</h2>
                </div>
                
                <div style="padding: 30px;">
                    <p style="color: #374151; font-size: 16px;">Hello,</p>
                    <p style="color: #374151; font-size: 16px;">You are invited to the following internal session:</p>
                    
                    <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
                        <h3 style="margin-top: 0; color: #111827; font-size: 18px;">${meeting.title}</h3>
                        <p style="margin: 8px 0; color: #4B5563;"><strong>📅 Date:</strong> ${meeting.date}</p>
                        <p style="margin: 8px 0; color: #4B5563;"><strong>⏰ Time:</strong> ${meeting.time}</p>
                        <p style="margin: 8px 0; color: #4B5563;"><strong>📍 Location:</strong> ${meeting.type === 'Online' ? (meeting.meetLink || 'Online') : meeting.location}</p>
                        <p style="margin: 8px 0; color: #4B5563;"><strong>👤 Host:</strong> ${meeting.host}</p>
                        ${meeting.description ? `<p style="margin: 8px 0; color: #4B5563;"><strong>📝 Details:</strong><br/>${meeting.description}</p>` : ''}
                    </div>

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${googleCalendarUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Add to Google Calendar</a>
                    </div>
                </div>
                
                <div style="background-color: #F3F4F6; padding: 15px; text-align: center; font-size: 12px; color: #6B7280;">
                    An .ics file is attached for Outlook, Apple Calendar, and other apps.
                </div>
            </div>
        `,
        attachments: [
            {
                filename: 'invite.ics',
                content: icsContent,
                contentType: 'text/calendar'
            }
        ]
    });

    try {
        const info = await transporter.sendMail(mailOptions());
        console.log('Email sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};
