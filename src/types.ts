export interface ReadingLogEntry {
    id: number;
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
    hrApprovalStatus?: 'Pending' | 'Approved' | 'Rejected'; // New: HR verification
    incentiveAmount?: number; // New: Approved incentive amount
    rejectionReason?: string; // New: Reason for rejection
}

export type Page = 'dashboard' | 'reading-log' | 'courses' | 'internal' | 'external' | 'calendar' | 'users' | 'admin-logs' | 'admin-dashboard' | 'incentives';
export type Role = 'STAFF' | 'SUPERVISOR' | 'HR' | 'HR_ADMIN';

export interface User {
    id?: number | string;
    name: string;
    email: string;
    role: Role;
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
    quiz?: Quiz; // Optional quiz attached to module
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
    assessment?: Quiz;
}

export interface QuizResult {
    id: number;
    studentId: number;
    studentName: string;
    courseId: number;
    moduleId: number;
    score: number;
    date: string;
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
    userName?: string;
    submittedAt?: string;
    supervisorName?: string;
    hrName?: string;
}

export interface Meeting {
    id: number;
    title: string;
    date: string;
    time: string;
    type: 'Online' | 'Offline' | 'Hybrid';
    host: string;
    description: string;
    location?: string;
    meetLink?: string;
    guests: {
        status: string;
        count: number;
        emails: string[];
    };
    costReport?: CostReport;
}

export interface CostReport {
    trainerIncentive: number;
    snackCost: number;
    lunchCost: number;
    otherCost: number;
    participantsCount: number; // Actual attendance
    isFinalized: boolean;
}

export interface Incentive {
    id: number;
    courseName: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    status: 'Active' | 'Expired' | 'Pending' | 'Denied' | 'Resign';
    reward: string;
    requesterName?: string;
    description?: string;
    evidenceUrl?: string; // Certificate photo
}
