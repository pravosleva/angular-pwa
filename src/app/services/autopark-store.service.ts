import { Injectable, signal } from '@angular/core';
import { AutoparkUserResponse } from '../pages/autopark/garage/garage'; // Корректируйте путь по необходимости

@Injectable({
  providedIn: 'root' // Синглтон-сервис, доступный по всему приложению
})
export class AutoparkStoreService {
  // Глобальный реактивный кэш для хранения ответа check-user
  public readonly cachedUserResponse = signal<AutoparkUserResponse | null>(null);

  /**
   * Метод для ручной очистки кэша при размонтировании или логауте
   */
  public clearCache(): void {
    this.cachedUserResponse.set(null);
  }
}
