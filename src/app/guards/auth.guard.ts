import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

interface CheckJwtResponse {
  ok: boolean;
  message?: string;
}

export const authGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> => {
  const http = inject(HttpClient);
  const router = inject(Router);

  // 1. Извлекаем chat_id из параметров пути
  const chat_id = route.paramMap.get('tg_chat_id');
  const targetChatId = chat_id ? Number(chat_id) : null;

  // Если зашли на плоский '/autopark' без id, сразу уводим на логин
  if (!targetChatId || Number.isNaN(targetChatId)) {
    console.warn('⚠️ [Auth Guard]: Отсутствует tg_chat_id в пути. Редирект на авторизацию.');
    return of(createLoginRedirect(router, state.url, ''));
  }

  const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-jwt';

  console.log(`🛡️ [Auth Guard]: Криптографическая верификация JWT для сессии ${targetChatId}...`);

  // 2. Отправляем запрос на /check-jwt
  return http.post<CheckJwtResponse>(
    apiUrl,
    { tested_chat_id: targetChatId }, // Соответствует контракту бэкенда checkJWT
    { withCredentials: true }         // Передаем HTTP-Only куки
  ).pipe(
    map((res) => {
      if (res && res.ok === true) {
        console.log('🟢 [Auth Guard]: Токен валиден, подпись совпадает. Доступ разрешен.');
        return true;
      }

      console.warn('🚨 [Auth Guard]: Токен не валиден или подменен. Отказ в доступе.');
      return createLoginRedirect(router, state.url, String(targetChatId));
    }),
    catchError((err) => {
      console.error('🔒 [Auth Guard]: Доступ заблокирован (Сессия истекла или отсутствует кука):', err.status);
      // Ловим 400, 500 и ошибки сети — гарантированно разлогиниваем в UI
      return of(createLoginRedirect(router, state.url, String(targetChatId)));
    })
  );
};

function createLoginRedirect(router: Router, currentUrl: string, chatId: string): UrlTree {
  return router.createUrlTree(['/auth/login'], {
    queryParams: {
      from: currentUrl,
      chat_id: chatId
    }
  });
}
