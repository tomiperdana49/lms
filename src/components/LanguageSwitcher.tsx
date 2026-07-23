import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { setAppLanguage } from '../i18n/config';

interface LanguageSwitcherProps {
    variant?: 'light' | 'dark';
}

const LanguageSwitcher = ({ variant = 'light' }: LanguageSwitcherProps) => {
    const { i18n } = useTranslation();
    const currentLang = i18n.language?.startsWith('id') ? 'id' : 'en';

    const toggle = () => {
        setAppLanguage(currentLang === 'en' ? 'id' : 'en');
    };

    const isDark = variant === 'dark';

    return (
        <button
            type="button"
            onClick={toggle}
            title={currentLang === 'en' ? 'Switch to Bahasa Indonesia' : 'Switch to English'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer
                ${isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-gray-100'}
            `}
        >
            <Globe size={14} />
            <span>{currentLang === 'en' ? 'EN' : 'ID'}</span>
        </button>
    );
};

export default LanguageSwitcher;
