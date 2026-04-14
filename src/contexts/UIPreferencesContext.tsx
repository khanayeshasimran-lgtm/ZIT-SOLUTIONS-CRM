import { createContext, useContext, useEffect, useState } from 'react';

type Language = 'en' | 'ar';
type Region = 'global' | 'ksa';
type Density = 'comfortable' | 'compact';

interface UIPreferences {
  language: Language;
  region: Region;
  density: Density;
  setLanguage: (v: Language) => void;
  setRegion: (v: Region) => void;
  setDensity: (v: Density) => void;
}

const UIPreferencesContext = createContext<UIPreferences | null>(null);

export function UIPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(
    (localStorage.getItem('ui_language') as Language) || 'en'
  );
  const [region, setRegion] = useState<Region>(
    (localStorage.getItem('ui_region') as Region) || 'global'
  );
  const [density, setDensity] = useState<Density>(
    (localStorage.getItem('ui_density') as Density) || 'comfortable'
  );

  useEffect(() => {
    localStorage.setItem('ui_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('ui_region', region);
  }, [region]);

  useEffect(() => {
    localStorage.setItem('ui_density', density);
  }, [density]);

  return (
    <UIPreferencesContext.Provider
      value={{
        language,
        region,
        density,
        setLanguage,
        setRegion,
        setDensity,
      }}
    >
      {children}
    </UIPreferencesContext.Provider>
  );
}

export function useUIPreferences() {
  const ctx = useContext(UIPreferencesContext);
  if (!ctx) {
    throw new Error(
      'useUIPreferences must be used inside UIPreferencesProvider'
    );
  }
  return ctx;
}
