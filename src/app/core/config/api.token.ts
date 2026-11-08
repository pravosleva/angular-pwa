import { InjectionToken, isDevMode } from '@angular/core';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    // 1. Если мы работаем локально (dev режим), шлем запросы на боевой бэк (или ваш localhost бэк)
    if (isDevMode()) {
      return 'https://pravosleva.pro';
    }

    // 2. На продакшене (pravosleva.pro) вычисляем домен динамически из браузера:
    // window.location.origin вернет "https://pravosleva.pro"
    return typeof window !== 'undefined' ? window.location.origin : 'https://pravosleva.pro';
  }
});
