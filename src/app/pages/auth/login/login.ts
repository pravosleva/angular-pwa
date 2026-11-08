import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';

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

          <!-- Рубеж проверки наличия Chat ID -->
          @if (isChatIdMissing()) {
            <div class="p-4 bg-amber-950/40 border border-amber-900/50 rounded-xl text-xs text-amber-400 font-mono leading-relaxed space-y-2">
              <p class="font-bold uppercase text-amber-300">⚠️ Критический сбой контекста</p>
              <p>Работа с приватным пультом невозможна без указания идентификатора гаража. Инициализируйте сессию через Telegram-бот или введите ID на главном дашборде.</p>
            </div>
          }

          @if (isCheckingSession()) {
            <!-- Спиннер автоматического входа по JWT куке -->
            <div class="p-4 bg-blue-950/30 border border-blue-900/40 rounded-xl text-center space-y-2 animate-pulse">
              <div class="animate-spin inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <p class="text-xs text-blue-400 font-mono">📡 Восстановление сессии по JWT...</p>
            </div>
          } @else {
            <div class="flex flex-col">
              <label for="pin" class="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2 font-mono">
                Введите 4-значный ПИН-код:
              </label>
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
            <button
              (click)="submitPassword()"
              [disabled]="!isFormValid() || isLoading() || isChatIdMissing()"
              class="w-full p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-medium rounded-xl text-sm tracking-wide font-mono transition-colors active:scale-[0.98] disabled:active:scale-100 cursor-not-allowed disabled:cursor-not-allowed flex justify-center items-center"
            >
              @if (isLoading()) {
                <span class="animate-pulse">📡 Проверка ПИН-кода...</span>
              } @else {
                <span>Запустить сессию →</span>
              }
            </button>
          }
        </div>

        <p class="text-[10px] font-mono text-neutral-500 text-center mt-6 leading-relaxed">
          *Базовый рубеж защиты. Требуется инициализация активной сессии через Telegram-бот.
        </p>
      </div>
    </div>
  `,
  styles: []
})
export class LoginComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  public readonly pinCode = signal<string>('');
  public readonly isLoading = signal<boolean>(false);
  public readonly isCheckingSession = signal<boolean>(false); // 🚨 НОВОЕ: состояние авто-проверки JWT
  public readonly errorMessage = signal<string | null>(null);

  public readonly targetChatId = computed(() => {
    return this.route.snapshot.queryParamMap.get('chat_id') || '';
  });

  public readonly fallbackRedirectUrl = computed(() => {
    return this.route.snapshot.queryParamMap.get('from') || '/autopark';
  });

  public readonly isFormValid = computed(() => {
    const pin = this.pinCode().trim();
    const hasChatId = this.targetChatId().trim().length > 0;
    return hasChatId && pin.length === 4 && !Number.isNaN(Number(pin));
  });

  public readonly isChatIdMissing = computed(() => {
    return this.targetChatId().trim().length === 0;
  });

  /**
   * 🚨 НОВОЕ: Хук инициализации проверяет JWT до того, как пользователь начнет ввод
   */
  ngOnInit(): void {
    this.checkExistingSession();
  }

  private checkExistingSession(): void {
    const currentChatId = this.targetChatId().trim();
    if (!currentChatId || Number.isNaN(Number(currentChatId))) return;

    this.isCheckingSession.set(true);

    this.authService.checkJwt(Number(currentChatId)).subscribe({
      next: (res) => {
        if (res && res.ok === true) {
          this.navigateToTarget();
        } else {
          this.isCheckingSession.set(false);
        }
      }
    });

    // -- v0
    // const checkJwtUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-jwt';

    // console.log(`📡 [Login Auto-Auth]: Обнаружен chat_id=${currentChatId}. Проверка фонового JWT-токена...`);

    // this.http.post<LoginResponse>(
    //   checkJwtUrl,
    //   { tested_chat_id: Number(currentChatId) },
    //   { withCredentials: true }
    // ).pipe(
    //   catchError((err) => {
    //     console.log('ℹ️ [Login Auto-Auth]: Активной или валидной сессии в куках нет (Требуется ПИН).', err.status);
    //     this.isCheckingSession.set(false);
    //     return of({ ok: false });
    //   })
    // ).subscribe({
    //   next: (res) => {
    //     if (res && res.ok === true) {
    //       console.log('🟢 [Login Auto-Auth]: Токен подтвержден! Перенаправление без ввода ПИН-кода...');
    //       this.navigateToTarget();
    //     } else {
    //       this.isCheckingSession.set(false);
    //     }
    //   }
    // });
    // --
  }

  public onPinChange(newPin: string): void {
    this.pinCode.set(newPin);
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  public submitPassword(): void {
    if (!this.isFormValid() || this.isLoading() || this.isChatIdMissing()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-password';
    const body = {
      chat_id: this.targetChatId().trim(),
      password: this.pinCode()
    };

    this.http.post<LoginResponse>(apiUrl, body, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [Login Net Error]:', err);
        this.errorMessage.set('Не удалось связаться с сервером авторизации.');
        this.isLoading.set(false);
        return of({ ok: false });
      })
    ).subscribe({
      next: (res) => {
        if (res && res.ok === true) {
          this.navigateToTarget();
        } else {
          this.isLoading.set(false);
          this.errorMessage.set((res as LoginResponse)?.message || 'Неверный 4-значный ПИН-код.');
        }
      }
    });
  }

  /**
   * 🛠️ ВЫНЕСЕНО В МЕТОД: Изолированная логика разбора путей и навигации
   */
  private navigateToTarget(): void {
    const currentChatId = this.targetChatId().trim();
    const rawRedirectUrl = this.fallbackRedirectUrl();
    let segments: string[] = [];

    // Безопасный парсинг URI-компонентов (декодирует %2F в слэши обратно)
    const decodedUrl = decodeURIComponent(rawRedirectUrl);

    if (decodedUrl === '/autopark' || decodedUrl === '/' || decodedUrl === '') {
      segments = ['autopark', currentChatId];
    } else {
      segments = decodedUrl.split('/').filter(p => p.trim().length > 0);
    }

    console.log('🚀 [Login Navigation]: Выполнение перехода на сегменты:', segments);

    this.router.navigate(segments)
      .then((navigated) => {
        if (!navigated) {
          this.isCheckingSession.set(false);
          this.isLoading.set(false);
          this.errorMessage.set('Рантайн Angular отклонил переход. Проверьте конфигурацию путей.');
        }
      })
      .catch((err) => {
        this.isCheckingSession.set(false);
        this.isLoading.set(false);
        this.errorMessage.set(`Критический сбой роутера: ${err.message || err}`);
      });
  }
}
