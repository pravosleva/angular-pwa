import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// Функция для условного старта MSW
async function prepareApp() {
  if (isDevMode()) {
    const { worker } = await import('./mocks/browser');

    // Вызываем start() без параметров, ошибка типов гарантированно исчезнет
    return worker.start();
  }
  return Promise.resolve();
}

// Сначала готовим окружение (стартуем MSW), затем монтируем Angular
prepareApp().then(() => {
  bootstrapApplication(App, appConfig)
    .catch((err) => console.error(err));
});
