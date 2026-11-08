import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// Переносим опцию 'bypass' сюда, чтобы MSW не ругался на неизвестные свойства
export const worker = setupWorker(...handlers);
// Можно управлять поведением через вызов методов, но дефолтного bypass обычно достаточно.
