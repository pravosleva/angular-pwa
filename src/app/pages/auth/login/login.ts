// src/app/pages/auth/login/login.component.ts (Часть 1 из 3)
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface LoginResponse {
  ok: boolean;
  message?: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col justify-center items-center min-h-screen bg-neutral-950 font-sans p-4 text-white">
      <div class="w-full max-w-xs bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl stack1">

        <!-- Заголовок пульта авторизации -->
        <div class="text-center mb-6">
          <h3 class="text-xl font-bold tracking-tight text-neutral-100">AutoPark 2022</h3>
          <p class="text-xs text-neutral-400 mt-1">Панель управления процессами</p>
          <div class="mt-2 text-xs bg-neutral-950 px-2 py-1 rounded border border-neutral-800 font-mono text-blue-400 inline-block">
            ID: {{ targetChatId() || 'Не указан' }}
          </div>
        </div>

        <div class="space-y-4">

          <!-- 🚨 НОВОЕ: Рубеж проверки наличия Chat ID -->
          @if (isChatIdMissing()) {
            <div class="p-4 bg-amber-950/40 border border-amber-900/50 rounded-xl text-xs text-amber-400 font-mono leading-relaxed space-y-2">
              <p class="font-bold uppercase text-amber-300">⚠️ Критический сбой контекста</p>
              <p>Работа с приватным пультом невозможна без указания идентификатора гаража. Инициализируйте сессию через Telegram-бот или введите ID на главном дашборде.</p>
            </div>
          }

          <div class="flex flex-col">
            <label for="pin" class="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2 font-mono">
              Введите 4-значный ПИН-код:
            </label>
            <!-- 🔒 ДОБАВЛЕНО: Дизейблим поле, если нет chat_id -->
            <input
              id="pin"
              type="password"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              placeholder="••••"
              [ngModel]="pinCode()"
              (ngModelChange)="onPinChange($event)"
              [disabled]="isLoading() || isChatIdMissing()"
              class="w-full text-center text-2xl tracking-widest p-3 bg-neutral-950 border border-neutral-800 rounded-xl focus:outline-none focus:border-blue-500 font-mono transition-colors disabled:opacity-40 text-white"
            />
          </div>

          <!-- Вывод системных ошибок рантайма -->
          @if (errorMessage()) {
            <div class="p-3 bg-red-950/50 border border-red-900/50 rounded-xl text-xs text-red-400 font-mono flex items-center gap-2">
              <span>⚠️</span> <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- Кнопка отправки POST-запроса -->
          <!-- 🔒 ДОБАВЛЕНО: Дизейблим кнопку, если нет chat_id -->
          <button
            (click)="submitPassword()"
            [disabled]="!isFormValid() || isLoading() || isChatIdMissing()"
            class="w-full p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-medium rounded-xl text-sm tracking-wide font-mono transition-colors active:scale-[0.98] disabled:active:scale-100 cursor-not-allowed disabled:cursor-not-allowed flex justify-center items-center"
          >
            @if (isLoading()) {
              <span class="animate-pulse">📡 Проверка рантайма...</span>
            } @else {
              <span>Запустить сессию →</span>
            }
          </button>
        </div>

        <p class="text-[10px] font-mono text-neutral-500 text-center mt-6 leading-relaxed">
          *Базовый рубеж защиты. Требуется инициализация активной сессии через Telegram-бот.
        </p>
      </div>
    </div>
  `,
  styles: []
})
export class LoginComponent {
  // 1. Внедряем системные зависимости фреймворка через движок DI
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // 2. Локальные примитивы состояния (Signals)
  public readonly pinCode = signal<string>('');
  public readonly isLoading = signal<boolean>(false);
  public readonly errorMessage = signal<string | null>(null);

  /**
   * 3. Извлекаем chat_id из query-параметров URL рантаймом.
   * snapshot позволяет прочитать значение синхронно при монтировании класса.
   */
  public readonly targetChatId = computed(() => {
    return this.route.snapshot.queryParamMap.get('chat_id') || '';
  });

  /**
   * 4. Вычисляем целевой URL для возврата после успешного входа.
   * Если параметр "from" пустой, фолбеком будет корень приватной панели '/autopark'.
   */
  public readonly fallbackRedirectUrl = computed(() => {
    return this.route.snapshot.queryParamMap.get('from') || '/autopark';
  });

  /**
   * 5. Обновленный граф вычислений валидности формы (DAG).
   * Блокирует отправку, если chat_id пустой ИЛИ пин-код не равен 4 цифрам.
   */
  public readonly isFormValid = computed(() => {
    const pin = this.pinCode().trim();
    const hasChatId = this.targetChatId().trim().length > 0;

    return hasChatId && pin.length === 4 && !Number.isNaN(Number(pin));
  });

  /**
   * Дополнительный computed-сигнал для проверки отсутствия ID
   */
  public readonly isChatIdMissing = computed(() => {
    return this.targetChatId().trim().length === 0;
  });

  /**
   * 6. Слушатель изменения поля ввода для хирургического сброса ошибок
   */
  public onPinChange(newPin: string): void {
    this.pinCode.set(newPin);
    if (this.errorMessage()) {
      this.errorMessage.set(null); // Точечно очищаем ошибку при вводе
    }
  }

  /**
   * 7. Отправка POST-запроса на валидацию ПИН-кода с умным редиректом
   */
  public submitPassword(): void {
    if (!this.isFormValid() || this.isLoading() || this.isChatIdMissing()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-password';
    const currentChatId = this.targetChatId().trim();

    const body = {
      chat_id: currentChatId,
      password: this.pinCode()
    };

    console.log('📡 [Login UI]: Запуск POST-верификации ПИН-кода...');

    this.http.post<LoginResponse>(
      apiUrl,
      body,
      { withCredentials: true }
    ).pipe(
      catchError((err) => {
        console.error('🚨 [Login Net Error]: Ошибка соединения с сервером:', err);
        this.errorMessage.set('Не удалось связаться с сервером авторизации.');
        return of({ ok: false });
      })
    ).subscribe({
      next: (res) => {
        this.isLoading.set(false);

                if (res && res.ok === true) {
          console.log('🟢 [Login Success]: Сессия на бэкенде успешно подтверждена.');

          const currentChatId = this.targetChatId().trim();
          const rawRedirectUrl = this.fallbackRedirectUrl();
          let segments: string[] = [];

          // 1. Формируем массив сегментов для перехода
          if (rawRedirectUrl === '/autopark' || rawRedirectUrl === '/' || rawRedirectUrl === '') {
            segments = ['autopark', currentChatId];
          } else {
            segments = rawRedirectUrl.split('/').filter(p => p.trim().length > 0);
          }

          // Трассируем подготовленный маршрут перед вызовом рантайма
          console.log('🔬 [Router Debug - Target Segments]:', segments);
          console.log('🔬 [Router Debug - BaseHref Context]:', document.querySelector('base')?.getAttribute('href'));
          console.log('🔬 [Router Debug - Current URL in Browser]:', window.location.href);

          // 2. Запускаем навигацию и ловим Promise
          this.router.navigate(segments)
            .then((navigationResult) => {
              if (navigationResult) {
                console.log('🚀 [Router Debug]: Переход выполнен успешно! Компонент должен быть на экране.');
              } else {
                console.error('❌ [Router Debug]: Рантайн Angular ОТКЛОНИЛ переход (Вернул false).');
                console.error('👉 Возможные причины: сработал CanActivate гвард на целевой странице, маршрут заблокирован или отменен другим переходом.');
                this.errorMessage.set('Система навигации отклонила переход. Проверьте статус авторизации в гварде.');
              }
            })
            .catch((routerError) => {
              console.error('🚨 [Router Debug - CRITICAL ERROR]: Во время перехода произошло падение:', routerError);
              this.errorMessage.set(`Критический сбой роутера: ${routerError.message || routerError}`);
            });

        } else {
          this.isLoading.set(false);
          this.errorMessage.set((res as LoginResponse)?.message || 'Неверный 4-значный ПИН-код.');
        }

      }
    });
  }
}
