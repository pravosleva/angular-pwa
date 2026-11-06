import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core'; // Исправленный импорт
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { APP_BASE_HREF } from '@angular/common'; // Импортируем токен базового пути
import { isDevMode } from '@angular/core';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Стабильный Zoneless-режим Angular 20+
    provideZonelessChangeDetection(),

    provideHttpClient(),
    provideRouter(appRoutes, withComponentInputBinding()),

    // 🔥 ГЛОБАЛЬНЫЙ КРИТИЧЕСКИЙ ФИКС: Устанавливаем базовый href рантайма.
    // Теперь любая команда router.navigate(['/autopark']) автоматически
    // превратится браузером в переход на /ng/autopark
    // { provide: APP_BASE_HREF, useValue: '/ng/' },

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:3000'
    }),
  ]
};
