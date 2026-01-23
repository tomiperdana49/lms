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
}

export type Page = 'dashboard' | 'reading-log' | 'courses' | 'internal' | 'external' | 'calendar' | 'users' | 'admin-logs' | 'admin-dashboard';
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
