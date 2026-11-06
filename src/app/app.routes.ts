import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  // 1. Публичный роут авторизации
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth/login/login').then(m => m.LoginComponent),
    title: 'AutoPark | Авторизация'
  },

  // -- TODO: 2. Группа приватных роутов виртуального гаража (Защищены единым authGuard)
  // 2. Плоские приватные маршруты (Защищены напрямую)
  {
    path: 'autopark',
    loadComponent: () => import('./pages/autopark/dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'AutoPark | Главная'
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
  // --

  // 3. Публичная страница отчета по автомобилю (Доступна всем без авторизации)
  {
    path: 'autopark/:tg_chat_id/:project_id/report',
    loadComponent: () => import('./pages/autopark/report/report').then(m => m.ReportComponent),
    title: 'AutoPark | Публичный отчет авто'
  },

  // Фолбек: если роут не найден, перенаправляем в корень приватной панели
  {
    path: '**',
    redirectTo: 'autopark'
  }
];
