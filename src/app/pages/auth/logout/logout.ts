import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface LogoutResponse {
  ok: boolean;
  message?: string;
}

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col justify-center items-center min-h-screen bg-neutral-950 font-sans p-4 text-white">
      <div class="w-full max-w-xs bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl text-center space-y-4">

        <h3 class="text-lg font-bold tracking-tight text-neutral-100">Завершение сессии</h3>

        @if (isLoading()) {
          <div class="space-y-3 py-4">
            <div class="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <p class="text-xs text-neutral-400 font-mono">📡 Деавторизация на сервере рантайма...</p>
          </div>
        }

        @if (errorMessage()) {
          <div class="space-y-4 py-2">
            <div class="p-3 bg-red-950/50 border border-red-900/50 rounded-xl text-xs text-red-400 font-mono flex items-center gap-2 text-left">
              <span>⚠️</span> <span>{{ errorMessage() }}</span>
            </div>

            <button
              (click)="fallbackNavigation()"
              class="w-full p-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-mono rounded-xl transition-colors"
            >
              Вернуться назад
            </button>
          </div>
        }
      </div>
    </div>
  `
})
export class LogoutComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  public readonly isLoading = signal<boolean>(true);
  public readonly errorMessage = signal<string | null>(null);

  /**
   * Извлекаем чистый целевой путь для редиректа.
   */
  public readonly successRedirectUrl = computed(() => {
    return this.route.snapshot.queryParamMap.get('success') || '/';
  });

  ngOnInit(): void {
    this.runLogoutProcedure();
  }

  private runLogoutProcedure(): void {
    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/logout';

    this.http.post<LogoutResponse>(apiUrl, {}, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [Logout Net Error]: Ошибка сети при выходе:', err);
        this.errorMessage.set('Не удалось связаться с сервером для безопасного выхода.');
        this.isLoading.set(false);
        return of({ ok: false });
      })
    ).subscribe({
      next: (res) => {
        if (res && res.ok === true) {
          this.isLoading.set(false);
          this.fallbackNavigation();
        } else {
          this.isLoading.set(false);
          this.errorMessage.set((res as LogoutResponse)?.message || 'Сервер отклонил запрос на выход.');
        }
      }
    });
  }

  /**
   * Метод выполняет переход, сохраняя или транслируя параметры контекста
   */
  public fallbackNavigation(): void {
    const target = this.successRedirectUrl();
    const segments = target.split('/').filter(p => p.trim().length > 0);

    // Получаем текущие query-параметры страницы логаута (например, там будет chat_id)
    const currentQueryParams = { ...this.route.snapshot.queryParams };

    // Исключаем сам управляющий параметр "success", чтобы он не дублировался на странице логина
    delete currentQueryParams['success'];

    this.router.navigate(segments.length ? segments : [''], {
      queryParams: currentQueryParams, // Прокидываем chat_id дальше!
    }).catch((err) => {
      console.error('🚨 [Logout Router Error]:', err);
      this.router.navigate(['']);
    });
  }
}
