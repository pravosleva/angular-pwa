// src/app/guards/auth.guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

// Минималистичный интерфейс ответа для гварда
interface CheckUserResponse {
  ok: boolean;
  code?: string;
}

export const authGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> => {
  const http = inject(HttpClient);
  const router = inject(Router);

  // 1. Пытаемся достать tg_chat_id из параметров текущего пути (например, /autopark/432590698)
  // или из родительских маршрутов, если это вложенный роут
  const chat_id = route.paramMap.get('tg_chat_id') || route.parent?.paramMap.get('tg_chat_id');

  // Если в УРЛе нет chat_id (например, зашли просто на /autopark),
  // но для check-user он критически необходим — можно заложить фолбек или пустить,
  // но мы сымитируем дефолтный chat_id или проверим его наличие
  const targetChatId = chat_id ? Number(chat_id) : null;

  // Если chat_id физически отсутствует в приватном пути, сразу отправляем на авторизацию без него
  if (!targetChatId) {
    return of(createLoginRedirect(router, state.url, ''));
  }

  const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022';

  console.log(`🛡️ [Auth Guard]: Запуск верификации пользователя ${targetChatId}...`);

  // 2. Делаем POST-запрос к API. HttpClient в Angular возвращает Observable
  return http.post<CheckUserResponse>(
    `${apiUrl}/check-user`,
    { tg: { chat_id: targetChatId } },
    { withCredentials: true } // КРИТИЧЕСКИ ВАЖНО: чтобы прикрепить куку autopark-2022.jwt
  ).pipe(
    map((res) => {
      console.log(res)
      if (res && res.ok === true) {
        console.log('🟢 [Auth Guard]: Сессия валидна, доступ разрешен.');
        return true; // Пропускаем на приватный роут
      }

      console.warn('季 [Auth Guard]: Сессия не валидна. Перенаправление на форму ввода ПИН-кода.');
      return createLoginRedirect(router, state.url, String(targetChatId));
    }),
    catchError((err) => {
      console.error('🚨 [Auth Guard]: Системный сбой сети при проверке сессии:', err);
      // В случае падения сети или ошибки 401/500 — жестко уводим на страницу входа
      return of(createLoginRedirect(router, state.url, String(targetChatId)));
    })
  );
};

/**
 * Вспомогательная функция для генерации UrlTree редиректа с query-параметрами
 */
function createLoginRedirect(router: Router, currentUrl: string, chatId: string): UrlTree {
  return router.createUrlTree(['/auth/login'], {
    queryParams: {
      from: currentUrl,
      to: currentUrl,
      chat_id: chatId
    }
  });
}
