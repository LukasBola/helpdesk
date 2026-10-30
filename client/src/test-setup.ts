import '@testing-library/jest-dom/vitest'

import { beforeEach } from 'vitest'

import i18n from '@/i18n'

// jsdom reports en-US; pin Polish so tests assert the default UI language.
beforeEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('pl')
})

const noop = (): void => undefined

// jsdom lacks a few browser APIs that Radix (Sheet, DropdownMenu) relies on.
if (!window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
    }
  }
  window.PointerEvent = PointerEvent as typeof window.PointerEvent
}

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= noop
Element.prototype.releasePointerCapture ??= noop
Element.prototype.scrollIntoView ??= noop

window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }) as MediaQueryList
