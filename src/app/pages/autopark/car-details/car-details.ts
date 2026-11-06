import { Component, signal, computed, inject, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap, startWith } from 'rxjs/operators';
import {
  // AutoparkUserResponse,
  // CarProject,
  CarItem,
} from '../garage/garage';

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

  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();
  public readonly isLoading = signal<boolean>(false);

  // Реактивный сигнал пробега текущей машины
  public readonly currentVehicleMileage = signal<number>(0);

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
      toObservable(this.project_id)
    ]).pipe(
      debounceTime(50),
      distinctUntilChanged((prev, curr) => prev[0] === curr[0] && prev[1] === curr[1]),
      tap(() => this.isLoading.set(true)),
      switchMap(([chatId, projectId]) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as TProjectDataResponse);
        }

        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/get-data';
        const body = { chat_id: Number(chatId), project_id: Number(projectId) };

        return this.http.post<TProjectDataResponse>(
          apiUrl,
          body,
          { withCredentials: true } // Фиксируем куку jwt на клиенте
        ).pipe(
          catchError((err) => {
            console.error('🚨 [Car Details Net Error]: Не удалось загрузить данные авто:', err);
            return of({ ok: false } as TProjectDataResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      // Защищаем компилятор от конфликтов инициализации через startWith и requireSync
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
}
