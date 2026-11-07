import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  // 0. Главная страница-консоль для всех подпроектов
  {
    path: '',
    loadComponent: () => import('./pages/main-dashboard/main-dashboard').then(m => m.MainDashboardComponent),
    title: 'Pravosleva Hub | Главная'
  },

  // 1. Сервисные роуты авторизации и детекции
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth/login/login').then(m => m.LoginComponent),
    title: 'AutoPark | Авторизация'
  },
  {
    path: 'auth/logout',
    loadComponent: () => import('./pages/auth/logout/logout').then(m => m.LogoutComponent)
  },
  {
    path: 'auth/detect-user',
    loadComponent: () => import('./pages/auth/detect-user/detect-user').then(m => m.DetectUserComponent),
    title: 'Hub | Идентификация сессии'
  },

  // -- TODO: 2. Группа приватных роутов виртуального гаража (Защищены единым authGuard)
  // 2. Плоские приватные маршруты (Защищены напрямую)
  {
    path: 'autopark',
    pathMatch: 'full',
    redirectTo: 'auth/detect-user?from=/autopark' // Если зашли без ID — отправляем на детектор
  },
  {
    path: 'autopark/:tg_chat_id',
    loadComponent: () => import('./pages/autopark/garage/garage').then(m => m.GarageComponent),
    canActivate: [authGuard],
    title: 'AutoPark | Виртуальный гараж'
  },
  {
    path: 'autopark/:tg_chat_id/:project_id',
    loadComponent: () => import('./pages/autopark/car-details/car-details').then(m => m.CarDetailsComponent),
    canActivate: [authGuard],
    title: 'AutoPark | Просмотр автомобиля'
  },
  // Публичная страница отчета по автомобилю (Доступна всем без авторизации)
  {
    path: 'autopark/:tg_chat_id/:project_id/report',
    loadComponent: () => import('./pages/autopark/report/report').then(m => m.ReportComponent),
    title: 'AutoPark | Публичный отчет авто'
  },
  // --

  // 3. Инфраструктура подпроекта: EVENT (Новый раздел с теми же гвардами защиты)
  {
    path: 'event',
    pathMatch: 'full',
    redirectTo: 'auth/detect-user?from=/event' // Если зашли без ID — отправляем на детектор с меткой /event
  },
  // {
  //   path: 'event/:tg_chat_id',
  //   loadComponent: () => import('./pages/event/dashboard/dashboard').then(m => m.EventDashboardComponent), // Ваш будущий компонент событий
  //   canActivate: [authGuard],
  //   title: 'Events | Панель управления событиями'
  // },

  // Фолбек: если роут не найден, перенаправляем в корень приватной панели
  {
    path: '**',
    redirectTo: ''
  }
];
