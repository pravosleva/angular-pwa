import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_BASE_URL } from '../core/config/api.token';

interface LoginResponse {
  ok: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);

  // 1. Внедряем базовый URL из .env через созданный InjectionToken
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Проверка сессии по JWT-куке
   */
  public checkJwt(chatId: number): Observable<LoginResponse> {
    // Собираем правильный абсолютный путь на проде: https://pravosleva.pro...
    const url = `${this.baseUrl}/express-helper/pravosleva-bot-2021/autopark-2022/check-jwt`;

    console.log(`📡 [Auth Service]: Запрос верификации к ${url}`);

    return this.http.post<LoginResponse>(
      url,
      { tested_chat_id: chatId },
      { withCredentials: true }
    ).pipe(
      catchError((err) => {
        console.error('🚨 [Auth Service Net Error]:', err);
        return of({ ok: false, message: 'Ошибка сети' });
      })
    );
  }

  /**
   * Проверка ПИН-кода при входе
   */
  public checkPassword(chatId: string, pin: string): Observable<LoginResponse> {
    const url = `${this.baseUrl}/express-helper/pravosleva-bot-2021/autopark-2022/check-password`;

    return this.http.post<LoginResponse>(
      url,
      { chat_id: chatId, password: pin },
      { withCredentials: true }
    );
  }
}
