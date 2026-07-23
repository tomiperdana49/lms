import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enLogin from './locales/en/loginPage.json';
import enDashboardLayout from './locales/en/dashboardLayout.json';
import enDashboardHome from './locales/en/dashboardHome.json';
import enAdminDashboard from './locales/en/adminDashboard.json';
import enAdminReadingLog from './locales/en/adminReadingLog.json';
import enCertificateTemplate from './locales/en/certificateTemplate.json';
import enCertificateView from './locales/en/certificateView.json';
import enConfirmationModal from './locales/en/confirmationModal.json';
import enCoursePlayer from './locales/en/coursePlayer.json';
import enExternalTraining from './locales/en/externalTraining.json';
import enFeedbackModal from './locales/en/feedbackModal.json';
import enHRReportGenerator from './locales/en/hrReportGenerator.json';
import enIncentiveManager from './locales/en/incentiveManager.json';
import enLMSCalendar from './locales/en/lmsCalendar.json';
import enNotificationPanel from './locales/en/notificationPanel.json';
import enOnlineModulesManager from './locales/en/onlineModulesManager.json';
import enPopupNotification from './locales/en/popupNotification.json';
import enQuizReportList from './locales/en/quizReportList.json';
import enReadingLogPage from './locales/en/readingLogPage.json';
import enTrainingExternalForm from './locales/en/trainingExternalForm.json';
import enTrainingExternalManager from './locales/en/trainingExternalManager.json';
import enTrainingInternalList from './locales/en/trainingInternalList.json';
import enUserManagement from './locales/en/userManagement.json';

import idCommon from './locales/id/common.json';
import idLogin from './locales/id/loginPage.json';
import idDashboardLayout from './locales/id/dashboardLayout.json';
import idDashboardHome from './locales/id/dashboardHome.json';
import idAdminDashboard from './locales/id/adminDashboard.json';
import idAdminReadingLog from './locales/id/adminReadingLog.json';
import idCertificateTemplate from './locales/id/certificateTemplate.json';
import idCertificateView from './locales/id/certificateView.json';
import idConfirmationModal from './locales/id/confirmationModal.json';
import idCoursePlayer from './locales/id/coursePlayer.json';
import idExternalTraining from './locales/id/externalTraining.json';
import idFeedbackModal from './locales/id/feedbackModal.json';
import idHRReportGenerator from './locales/id/hrReportGenerator.json';
import idIncentiveManager from './locales/id/incentiveManager.json';
import idLMSCalendar from './locales/id/lmsCalendar.json';
import idNotificationPanel from './locales/id/notificationPanel.json';
import idOnlineModulesManager from './locales/id/onlineModulesManager.json';
import idPopupNotification from './locales/id/popupNotification.json';
import idQuizReportList from './locales/id/quizReportList.json';
import idReadingLogPage from './locales/id/readingLogPage.json';
import idTrainingExternalForm from './locales/id/trainingExternalForm.json';
import idTrainingExternalManager from './locales/id/trainingExternalManager.json';
import idTrainingInternalList from './locales/id/trainingInternalList.json';
import idUserManagement from './locales/id/userManagement.json';

export const LANGUAGE_STORAGE_KEY = 'lms_language';

const savedLanguage = typeof window !== 'undefined' ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: {
                common: enCommon,
                loginPage: enLogin,
                dashboardLayout: enDashboardLayout,
                dashboardHome: enDashboardHome,
                adminDashboard: enAdminDashboard,
                adminReadingLog: enAdminReadingLog,
                certificateTemplate: enCertificateTemplate,
                certificateView: enCertificateView,
                confirmationModal: enConfirmationModal,
                coursePlayer: enCoursePlayer,
                externalTraining: enExternalTraining,
                feedbackModal: enFeedbackModal,
                hrReportGenerator: enHRReportGenerator,
                incentiveManager: enIncentiveManager,
                lmsCalendar: enLMSCalendar,
                notificationPanel: enNotificationPanel,
                onlineModulesManager: enOnlineModulesManager,
                popupNotification: enPopupNotification,
                quizReportList: enQuizReportList,
                readingLogPage: enReadingLogPage,
                trainingExternalForm: enTrainingExternalForm,
                trainingExternalManager: enTrainingExternalManager,
                trainingInternalList: enTrainingInternalList,
                userManagement: enUserManagement,
            },
            id: {
                common: idCommon,
                loginPage: idLogin,
                dashboardLayout: idDashboardLayout,
                dashboardHome: idDashboardHome,
                adminDashboard: idAdminDashboard,
                adminReadingLog: idAdminReadingLog,
                certificateTemplate: idCertificateTemplate,
                certificateView: idCertificateView,
                confirmationModal: idConfirmationModal,
                coursePlayer: idCoursePlayer,
                externalTraining: idExternalTraining,
                feedbackModal: idFeedbackModal,
                hrReportGenerator: idHRReportGenerator,
                incentiveManager: idIncentiveManager,
                lmsCalendar: idLMSCalendar,
                notificationPanel: idNotificationPanel,
                onlineModulesManager: idOnlineModulesManager,
                popupNotification: idPopupNotification,
                quizReportList: idQuizReportList,
                readingLogPage: idReadingLogPage,
                trainingExternalForm: idTrainingExternalForm,
                trainingExternalManager: idTrainingExternalManager,
                trainingInternalList: idTrainingInternalList,
                userManagement: idUserManagement,
            },
        },
        lng: savedLanguage || 'en',
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false,
        },
    });

export const setAppLanguage = (lang: 'en' | 'id') => {
    i18n.changeLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
};

export default i18n;
