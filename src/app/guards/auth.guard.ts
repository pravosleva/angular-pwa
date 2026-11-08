import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { of, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> => {
  const router = inject(Router);
  const authService = inject(AuthService); // Внедряем AuthService вместо HttpClient

  // 1. Извлекаем chat_id из параметров пути
  const chat_id = route.paramMap.get('tg_chat_id');
  const targetChatId = chat_id ? Number(chat_id) : null;

  // Если зашли на плоский URL без id, сразу уводим на логин
  if (!targetChatId || Number.isNaN(targetChatId)) {
    console.warn('⚠️ [Auth Guard]: Отсутствует tg_chat_id в пути. Редирект на авторизацию.');
    return of(createLoginRedirect(router, state.url, ''));
  }

  console.log(`🛡️ [Auth Guard]: Делегирование верификации JWT сервису для сессии ${targetChatId}...`);

  // 2. Используем метод сервиса (обработка catchError и base URL уже внутри него)
  return authService.checkJwt(targetChatId).pipe(
    map((res) => {
      if (res && res.ok === true) {
        console.log('🟢 [Auth Guard]: Токен валиден, подпись совпадает. Доступ разрешен.');
        return true;
      }

      console.warn('🚨 [Auth Guard]: Токен не валиден или отсутствует кука. Отказ в доступе.');
      return createLoginRedirect(router, state.url, String(targetChatId));
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
