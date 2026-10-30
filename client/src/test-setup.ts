import '@testing-library/jest-dom/vitest'

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
