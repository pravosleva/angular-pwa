import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Описание ответа экспресс-проверки аккаунта на главном пульте
 */
interface QuickCheckResponse {
  ok: boolean;
  code?: string;
  message?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex flex-col justify-center items-center min-h-screen bg-neutral-950 font-sans p-4 text-white">
      <div class="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">

        <!-- Заголовок главного пульта -->
        <div class="text-center space-y-1 border-b border-neutral-800 pb-4">
          <h2 class="text-xl font-black tracking-tight text-neutral-100 uppercase">AutoPark Core</h2>
          <p class="text-xs text-neutral-400 font-mono">Центральная консоль управления</p>
        </div>

        <!-- Информационная карточка -->
        <div class="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2 text-xs font-mono text-neutral-400 leading-relaxed">
          <p class="text-blue-400 font-bold">ℹ️ Статус системы: Активен</p>
          <p>Введите ваш уникальный Telegram Идентификатор (Chat ID), чтобы выполнить синхронизацию с виртуальным гаражом и базами данных ТО.</p>
        </div>

        <!-- Контур ввода данных -->
        <div class="space-y-4">
          <div class="flex flex-col">
            <label for="chatIdInput" class="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2 font-mono">
              Идентификатор исследователя (Telegram Chat ID):
            </label>
            <input
              id="chatIdInput"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="Например: 432590698"
              [ngModel]="inputChatId()"
              (ngModelChange)="onChatIdChange($event)"
              [disabled]="isLoading()"
              class="w-full text-center text-lg p-3 bg-neutral-950 border border-neutral-800 rounded-xl focus:outline-none focus:border-blue-500 font-mono transition-colors disabled:opacity-50 text-white"
            />
          </div>

          <!-- Вывод системных ошибок -->
          @if (systemMessage()) {
            <div class="p-3 bg-red-950/50 border border-red-900/50 rounded-xl text-xs text-red-400 font-mono flex items-center gap-2 animate-fade-in">
              <span>⚠️</span> <span>{{ systemMessage() }}</span>
            </div>
          }

          <!-- Кнопка инициализации и перехода -->
          <button
            (click)="initializeGarageSession()"
            [disabled]="!isFormValid() || isLoading()"
            class="w-full p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold rounded-xl text-xs uppercase tracking-wider font-mono transition-all active:scale-[0.98] disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed flex justify-center items-center"
          >
            @if (isLoading()) {
              <span class="animate-pulse">📡 Верификация аккаунта...</span>
            } @else {
              <span>Подключить гараж →</span>
            }
          </button>
        </div>

        <!-- Ссылка на логаут/сброс -->
        <div class="text-center pt-2 border-t border-neutral-800">
          <a routerLink="/auth/login" class="text-[10px] font-mono text-neutral-500 hover:text-neutral-300 transition-colors">
            Сбросить текущую JWT сессию
          </a>
        </div>

      </div>
    </div>
  `,
  styles: []
})
export class DashboardComponent {
  // 1. Внедряем системные сервисы фреймворка через движок DI
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // 2. Локальные примитивы состояния (Signals)
  public readonly inputChatId = signal<string>('');
  public readonly isLoading = signal<boolean>(false);
  public readonly systemMessage = signal<string | null>(null);

  /**
   * 3. Граф вычислений валидности формы (DAG).
   * Разблокирует процесс, только если введен числовой ID длиной от 6 до 15 символов.
   */
  public readonly isFormValid = computed<boolean>(() => {
    const id = this.inputChatId().trim();
    const isNumeric = id.length >= 6 && id.length <= 15 && !Number.isNaN(Number(id));
    return isNumeric;
  });

  /**
   * 4. Слушатель изменения поля ввода для хирургического сброса ошибок
   */
  public onChatIdChange(newValue: string): void {
    // Оставляем только цифры при вводе
    const sanitizedValue = newValue.replace(/\D/g, '');
    this.inputChatId.set(sanitizedValue);

    if (this.systemMessage()) {
      this.systemMessage.set(null); // Точечно очищаем ошибку при печати
    }
  }

  /**
   * 5. Инициализация сессии и переход в персональный гараж
   */
  public initializeGarageSession(): void {
    if (!this.isFormValid() || this.isLoading()) return;

    this.isLoading.set(true);
    this.systemMessage.set(null);

    const targetId = this.inputChatId().trim();
    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-user';
    const body = { tg: { chat_id: Number(targetId) } };

    console.log(`📡 [Dashboard UI]: Запуск экспресс-проверки аккаунта #${targetId}...`);

    this.http.post<QuickCheckResponse>(
      apiUrl,
      body,
      { withCredentials: true } // Проверяем и прикрепляем сессионную куку jwt
    ).pipe(
      catchError((err) => {
        console.error('🚨 [Dashboard Net Error]: Сбой рантайма сети:', err);
        this.systemMessage.set('Ошибка связи с сервером pravosleva.pro.');
        return of({ ok: false } as QuickCheckResponse);
      })
    ).subscribe({
      next: (res) => {
        this.isLoading.set(false);

        if (res && res.ok === true) {
          console.log(`🟢 [Dashboard Success]: Аккаунт валиден. Перенаправляю в гараж /autopark/${targetId}`);

          // Роутинг на страницу персонального гаража
          this.router.navigate(['/autopark', targetId]);
        } else {
          console.warn('季 [Dashboard Warning]: Пользователь не зарегистрирован в системе бота.');

          // Если пользователя нет, переводим на страницу авторизации,
          // чтобы он ввел 4-значный ПИН-код для инициализации новой сессии
          this.router.navigate(['/auth/login'], {
            queryParams: {
              from: `/autopark/${targetId}`,
              to: `/autopark/${targetId}`,
              chat_id: targetId
            }
          });
        }
      }
    });
  }
}
