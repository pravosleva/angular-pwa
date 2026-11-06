import { Component, signal, computed, inject, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap, startWith } from 'rxjs/operators';
import {
  // AutoparkUserResponse,
  // CarProject,
  CarItem,
} from '../garage/garage';
import { AutoparkStoreService } from '../../../services/autopark-store.service';

/**
 * Расширенные интерфейсы для UI-отображения прогресса износа/сервиса
 */
export interface UICarProcess {
  id: number;
  name: string;
  description: string;
  lastMileage: number;
  deltaMileage: number;
  progressPercent: number; // Вычисляемый рантаймом процент износа/пробега
}

type TJobItem = {
  id: number;
  name: string;
  description: string;
  mileage: {
      last: number;
      delta: number;
  };
}
type TProjectData = {
  name: string;
  description: string;
  items: TJobItem[];
}
type TProjectDataResponse = {
  ok: boolean;
  message?: string;
  projectData?: TProjectData;
}

@Component({
  selector: 'app-car-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './car-details.html',
  styles: []
})
export class CarDetailsComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly store = inject(AutoparkStoreService);

  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();
  public readonly isLoading = signal<boolean>(false);

  // Реактивный сигнал пробега текущей машины
  public readonly currentVehicleMileage = signal<number>(0);

  // Основные и новые реактивные сигналы для модального окна и состояния
  public readonly isSubmitting = signal<boolean>(false);
  public readonly isEditModalOpen = signal<boolean>(false);
  public readonly apiError = signal<string>('');
  private readonly refreshTrigger = signal<number>(0);

  // Буферные сигналы для полей редактирования
  public readonly editItemId = signal<number | null>(null);
  public readonly editItemName = signal<string>('');
  public readonly editItemDescription = signal<string>('');
  public readonly editItemMileageLast = signal<number>(0);
  public readonly editItemMileageDelta = signal<number>(0);

  public readonly isCreateModalOpen = signal<boolean>(false);
  public readonly createItemName = signal<string>('');
  public readonly createItemDescription = signal<string>('');
  public readonly createItemMileageLast = signal<number>(0);
  public readonly createItemMileageDelta = signal<number>(0);
  public readonly createApiError = signal<string>('');

  public readonly vehicleDeleteError = signal<string>('');

  constructor() {
    // Реактивный эффект для синхронизации стейта с localStorage.
    // Отслеживает изменение project_id() и автоматически восстанавливает пробег.
    effect(() => {
      const pid = this.project_id();
      if (pid) {
        const localData = localStorage.getItem(`autopark_mileage_${pid}`);
        // Если в localStorage пусто, ставим дефолтный базовый пробег 10000
        this.currentVehicleMileage.set(localData ? Number(localData) : 10000);
      }
    }, { allowSignalWrites: true });
  }

  /**
   * Метод для ручного изменения пробега пользователем
   */
  public updateMileage(newValue: number): void {
    const numericValue = Number(newValue) || 0;
    this.currentVehicleMileage.set(numericValue);
    // Мгновенное сохранение в хранилище под изолированным ключом машины
    localStorage.setItem(`autopark_mileage_${this.project_id()}`, String(numericValue));
  }

  private readonly apiResponse = toSignal<TProjectDataResponse>(
    combineLatest([
      toObservable(this.tg_chat_id),
      toObservable(this.project_id),
      toObservable(this.refreshTrigger) // Интеграция сигнала автообновления
    ]).pipe(
      debounceTime(50),
      distinctUntilChanged((prev, curr) =>
        prev[0] === curr[0] && prev[1] === curr[1] && prev[2] === curr[2]
      ),
      tap(() => this.isLoading.set(true)),
      switchMap(([chatId, projectId]) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as TProjectDataResponse);
        }

        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/get-data';
        const body = { chat_id: Number(chatId), project_id: Number(projectId) };

        return this.http.post<TProjectDataResponse>(apiUrl, body, { withCredentials: true }).pipe(
          catchError((err) => {
            console.error('🚨 [Car Details Net Error]: Не удалось загрузить данные авто:', err);
            return of({ ok: false } as TProjectDataResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      startWith({ ok: false } as TProjectDataResponse)
    ),
    { requireSync: true }
  );
  public readonly currentCar = computed<TProjectData | null>(() => this.apiResponse()?.projectData || null);

  /**
   * 5. Обновленное выражение: Рассчитывает износ на основе ЖИВОГО сигнала пробега
   */
  public readonly processes = computed<UICarProcess[]>(() => {
    const car = this.currentCar();
    if (!car || !car.items) return [];

    // 🔥 Читаем живой пробег из сигнала, избавляясь от хардкода 310000
    const currentVehicleMileage = this.currentVehicleMileage();

    return car.items.map((item: CarItem) => {
      const last = item.mileage.last;
      const delta = item.mileage.delta || 40000;
      const drivenSinceLastTO = currentVehicleMileage - last;

      let percent = 0;
      if (drivenSinceLastTO > 0) {
        percent = Math.round((drivenSinceLastTO / delta) * 100);
      }

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        lastMileage: last,
        deltaMileage: delta,
        progressPercent: percent < 0 ? 0 : percent
      };
    });
  });

  /**
   * Вычисляемая валидация формы редактирования «на лету»
   */
  public readonly isEditFormValid = computed<boolean>(() => {
    return Boolean(
      this.editItemId() &&
      this.editItemName().trim().length > 0 &&
      this.editItemDescription().trim().length > 0 &&
      this.editItemMileageLast() >= 0 &&
      this.editItemMileageDelta() > 0
    );
  });

  /**
   * Открытие модального окна и наполнение буферных сигналов начальным состоянием
   */
  public openEditModal(item: any): void {
    this.apiError.set('');
    this.editItemId.set(item.id);
    this.editItemName.set(item.name);
    this.editItemDescription.set(item.description);
    this.editItemMileageLast.set(item.lastMileage || item.mileage?.last || 0);
    this.editItemMileageDelta.set(item.deltaMileage || item.mileage?.delta || 40000);

    this.isEditModalOpen.set(true);
    console.log(`🔬 [Edit Modal]: Сессия редактирования запущена для элемента #${item.id}`);
  }

  /**
   * Закрытие модального окна и полная очистка буферов
   */
  public closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editItemId.set(null);
    this.editItemName.set('');
    this.editItemDescription.set('');
    this.editItemMileageLast.set(0);
    this.editItemMileageDelta.set(0);
    this.apiError.set('');
  }

  public readonly isCreateFormValid = computed<boolean>(() => {
    return Boolean(
      this.createItemName().trim().length > 0 &&
      this.createItemDescription().trim().length > 0 &&
      this.createItemMileageLast() >= 0 &&
      this.createItemMileageDelta() > 0
    );
  });

  /**
   * Отправка POST-запроса на удаление регламентной работы с конфирмом
   */
  public deleteItemProcess(itemId: number, itemName: string): void {
    if (!confirm(`Вы действительно хотите удалить позицию "${itemName}"?`)) return;

    this.isLoading.set(true);

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/remove-item';
    const payload = {
      chat_id: String(Number(this.tg_chat_id())),
      project_id: String(Number(this.project_id())),
      item_id: itemId
    };

    this.http.post<any>(apiUrl, payload, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [DeleteItem API Error]:', err);
        return of(null);
      })
    ).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && res.ok === true) {
          console.log('🟢 [DeleteItem API Success]: Позиция успешно удалена.');

          // 🔥 КРИТИЧЕСКИЙ ФИКС: Инвалидируем стейт для автообновления списка в UI
          this.refreshTrigger.update(v => v + 1);
        } else {
          alert(res?.message || 'Бэкенд отклонил удаление позиции.');
        }
      }
    });
  }

  /**
   * Отправка POST-запроса на обновление регламентной работы (Редактирование)
   */
  public submitEditForm(): void {
    if (!this.isEditFormValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.apiError.set('');

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/update-item';

    const payload = {
      chat_id: String(Number(this.tg_chat_id())),
      project_id: String(Number(this.project_id())),
      item: {
        id: this.editItemId(),
        name: this.editItemName().trim(),
        description: this.editItemDescription().trim(),
        mileage: {
          last: Number(this.editItemMileageLast()),
          delta: Number(this.editItemMileageDelta())
        }
      }
    };

    console.log('📡 [Car Details API]: Отправка payload обновления позиции...', payload);

    this.http.post<any>(apiUrl, payload, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [EditItem API Error]:', err);
        this.apiError.set('Не удалось обновить позицию.');
        return of(null);
      })
    ).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);

        if (res && res.ok === true) {
          console.log('🟢 [EditItem API Success]: Позиция успешно обновлена.');
          this.closeEditModal(); // Закрываем модалку и чистим буферы

          // 🔥 КРИТИЧЕСКИЙ ФИКС: Инвалидируем стейт для автообновления списка в UI
          this.refreshTrigger.update(v => v + 1);
        } else {
          this.apiError.set(res?.message || 'Ошибка обновления позиции бэкендом.');
        }
      }
    });
  }

  /**
   * Открытие модального окна создания новой работы
   */
  public openCreateModal(): void {
    this.createApiError.set('');
    this.createItemName.set('');
    this.createItemDescription.set('');
    // Автоподстановка: берем живой пробег машины из localStorage как стартовую точку
    this.createItemMileageLast.set(this.currentVehicleMileage());
    this.createItemMileageDelta.set(10000); // Дефолтный регламентный интервал (10к км)

    this.isCreateModalOpen.set(true);
    console.log('🔬 [Create Modal]: Сессия инициализации нового процесса ТО запущена.');
  }

  public closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.createItemName.set('');
    this.createItemDescription.set('');
    this.createItemMileageLast.set(0);
    this.createItemMileageDelta.set(0);
    this.createApiError.set('');
  }

  /**
   * Отправка POST-запроса на создание новой регламентной работы
   */
  public submitCreateForm(): void {
    if (!this.isCreateFormValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.createApiError.set('');

    // const apiUrl = 'https://pravosleva.pro'; // Корневой шлюз, эндпоинт /project/add-item подставится раутером axios
    // Для сохранения сквозной совместимости с вашей экспресс-архитектурой бэкенда, шлем на прямой урл:
    const directAddItemUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/add-item';

    const payload = {
      chat_id: String(Number(this.tg_chat_id())),
      project_id: String(Number(this.project_id())),
      item: {
        name: this.createItemName().trim(),
        description: this.createItemDescription().trim(),
        mileage: {
          last: Number(this.createItemMileageLast()),
          delta: Number(this.createItemMileageDelta())
        }
      }
    };

    console.log('📡 [CreateItem API]: Инициализация отправки payload...', payload);

    this.http.post<any>(directAddItemUrl, payload, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [CreateItem API Error]: Critical network crash:', err);
        this.createApiError.set(err?.message || 'Не удалось связаться с сервером создания.');
        return of(null);
      })
    ).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);

        if (res && res.ok === true) {
          console.log('🟢 [CreateItem API Success]: Новая позиция успешно добавлена в сервисную книжку.');
          this.closeCreateModal(); // Сворачиваем окно и чистим буферы
          this.refreshTrigger.update(v => v + 1); // 🔥 ТРИГГЕРИМ РЕАКТИВНОЕ ОБНОВЛЕНИЕ СПИСКА
        } else {
          console.warn('⚠️ [CreateItem API Warning]: Бэкенд отклонил добавление позиции.');
          this.createApiError.set(res?.message || 'Сервер отклонил создание регламентной работы.');
        }
      }
    });
  }

  /**
   * Отправка POST-запроса на полное удаление автомобиля из гаража с конфирмом и редиректом
   */
  public deleteVehicleProcess(vehicleName: string): void {
    if (!confirm(`Критическое действие! Вы действительно хотите безвозвратно удалить автомобиль "${vehicleName}" и всю историю его процессов ТО?`)) {
      return;
    }

    this.isLoading.set(true);
    this.vehicleDeleteError.set('');

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/remove';
    const currentProjectId = this.project_id();

    const payload = {
      chat_id: String(Number(this.tg_chat_id())),
      project_id: currentProjectId
    };

    console.log('📡 [Car Details API]: Запуск процесса удаления проекта авто...', payload);

    this.http.post<any>(apiUrl, payload, { withCredentials: true }).pipe(
      catchError((err) => {
        console.error('🚨 [DeleteVehicle API Error]:', err);
        this.vehicleDeleteError.set(err?.message || 'Системный сбой сети при удалении проекта.');
        return of(null);
      })
    ).subscribe({
      next: (res) => {
        this.isLoading.set(false);

        if (res && res.ok === true) {
          console.log('裁 [DeleteVehicle API Success]: Автомобиль успешно удален из базы данных.');

          // 1. Очищаем изолированное хранилище пробега для этой конкретной машины
          localStorage.removeItem(`autopark_mileage_${currentProjectId}`);

          // 2. ИНВАЛИДАЦИЯ КЭША ВСЕГО ГАРАЖА: Очищаем кэш в глобальном синглтон-сторе,
          // чтобы компонент GarageComponent при возврате гарантированно скачал свежий список проектов!
          this.store.clearCache();

          // 3. Выполняем навигацию назад в гараж пользователя
          this.router.navigate(['/autopark', this.tg_chat_id()])
            .then(() => console.log('🚀 Редирект в виртуальный гараж выполнен успешно.'))
            .catch(err => console.error('🚨 Ошибка редиректа роутера:', err));

        } else {
          console.warn('⚠️ [DeleteVehicle API Warning]: Бэкенд отклонил удаление.');
          this.vehicleDeleteError.set(res?.message || 'Сервер отклонил удаление данного автомобиля.');
        }
      }
    });
  }
}
