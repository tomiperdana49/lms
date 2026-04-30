export interface ReadingLogEntry {
    id: number | string;
    title: string;
    category: string;
    link?: string;
    date: string;
    status?: string;
    location?: string;
    source?: string;
    userName?: string; // To track who read it
    review?: string;
    duration?: number;
    readingDuration?: number; // Calculated or stored duration
    startDate?: string;
    finishDate?: string;
    evidenceUrl?: string;
    returnEvidenceUrl?: string;
    hrApprovalStatus?: 'Pending' | 'Approved' | 'Rejected' | 'Draft' | 'Cancelled'; // New: HR verification
    incentiveAmount?: number; // New: Approved incentive amount
    rejectionReason?: string; // New: Reason for rejection
    employee_id?: string;
    approvedBy?: string;
    sn?: string;
    approvedAt?: string;
    plannedFinishDate?: string;
    cancelledAt?: string;
    cancelledBy?: string;
    claimedAt?: string;
}

export type Page = 'dashboard' | 'reading-log' | 'courses' | 'internal' | 'external' | 'external-approval' | 'calendar' | 'users' | 'admin-logs' | 'admin-dashboard' | 'incentives';
export type Role = 'STAFF' | 'SUPERVISOR' | 'HR' | 'HR_ADMIN';
export type AdminView = 'users' | 'logs' | 'approval' | 'meetings' | 'courses' | 'assets' | 'employees';

export interface User {
    id?: number | string;
    name: string;
    email: string;
    role: Role;
    branch?: string;
    avatar?: string;
    employee_id?: string; // Linked SimAsset Employee ID
    employee_name?: string;
}

export interface Question {
    id: number;
    question: string;
    options: string[];
    correctAnswer: number; // Index
}

export interface Quiz {
    id: number;
    title: string;
    questions: Question[];
}

export interface Module {
    id: number;
    title: string;
    duration: string;
    videoType?: 'youtube' | 'local';
    videoId?: string;
    locked: boolean;
    completed?: boolean;
    quiz?: Quiz; // Post-test
    preQuiz?: Quiz; // Pre-test
}

export interface Course {
    id: number;
    title: string;
    description: string;
    duration: string;
    modulesCount: number;
    studentCount: number;
    progress: number;
    modules: Module[];
    assessment?: Quiz; // Final Post-test
    preAssessment?: Quiz; // Final Pre-test
}

export interface QuizResult {
    id: number;
    studentId: number;
    studentName: string;
    courseId: number;
    moduleId: number;
    meetingId?: number;
    meeting_id?: number;
    score: number;
    date: string;
    employee_id?: string;
    quizType?: 'PRE' | 'POST';
    quiz_type?: 'PRE' | 'POST';
}

export interface TrainingRequest {
    id: number;
    employeeName: string;
    employeeRole: string;
    title: string;
    vendor: string;
    cost: number;
    date: string;
    status: 'PENDING_SUPERVISOR' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';
    justification: string;
    priority: 'High' | 'Medium' | 'Low';
    location?: string;
    division?: string;
    rejectionReason?: string;
    additionalCost?: number;
    costTraining?: number;
    costTransport?: number;
    costAccommodation?: number;
    costOthers?: number;
    evidenceUrl?: string;
    userName?: string;
    submittedAt?: string;
    supervisorName?: string;
    hrName?: string;
    employee_id?: string;
}

export interface Meeting {
    id: number;
    title: string;
    date: string;
    time: string;
    type: 'Online' | 'Offline' | 'Hybrid';
    host: string;
    employee_id?: string; // Host Employee ID
    description: string;
    agenda?: string; // Legacy/Backend name for description
    location?: string;
    meetLink?: string;
    guests: {
        status: string;
        count: number;
        emails: string[];
        employee_ids?: string[];
    };
    costReport?: CostReport;
    pre_test_link?: string;
    material_link?: string;
    post_test_link?: string;
    feedback_link?: string;
    pre_test_data?: Quiz;
    post_test_data?: Quiz;
    feedback_data?: any;
    is_pre_test_active?: boolean | number;
    is_post_test_active?: boolean | number;
    is_feedback_active?: boolean | number;
    is_closed?: boolean | number;
    
    // Extended fields for reporting
    training_hours?: number;
    competency_type?: string;
    competency_detail?: string;
    participation_type?: string;
    vendor?: string;
    esg_hse_other?: string;
    action_plan?: string;
    detail_participant_type?: string;
}

export interface CostReport {
    trainerIncentive: number;
    audienceFee?: number; // New cost per audience member
    snackCost: number;
    lunchCost: number;
    otherCost: number;
    participantsCount: number; // Actual attendance
    attendees?: string[]; // List of emails of attendees
    attendee_ids?: string[]; // List of employee_ids of attendees
    isFinalized: boolean;
    isPaid?: boolean;
    evidenceLink?: string; // Link to drive/materials
    trainingPhotos?: string; // New: Uploaded training photos URL
}

export interface Incentive {
    id: number;
    courseName: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    status: 'Active' | 'Expired' | 'Pending' | 'Denied' | 'Canceled' | 'Paid';
    reward: string;
    requesterName?: string;
    description?: string;
    evidenceUrl?: string; // Certificate photo
    paymentType?: 'One-Time' | 'Recurring'; // New: Payment frequency
    approvedDate?: string;
    employee_id?: string;
}

export interface Employee {
    id: number;
    id_employee: string;
    branch_id: string;
    full_name: string;
    name?: string; // Compatibility field
    job_position: string;
    email: string;
    mobile_phone: string;
    photo_profile: string;
    job_level: string;
    organization_name: string;
    status_join: string;
    branch_name?: string;

    // Extended fields for reporting
    company_group?: string;
    company?: string;
    band?: string;
    directorate?: string;
    department?: string;
    lob?: string;
    division_type_mapping?: string;
    age?: number | string;
    age_group?: string;
    gender?: string;
}

export interface Asset {
    id: number;
    asset_uuid: string;
    sub_category_id: number;
    name: string;
    description: string;
    model: string;
    price: number;
    user: string; // The assigned user name/id string in assets table
    purchase_date: string;
    status: 'active' | 'in repair' | 'disposed';
    code: string;
    image_path: string;
    brand: string;
    category_name?: string; // Joined
    sub_category_name?: string; // Joined
}
