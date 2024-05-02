import {
  Component,
  ComponentProps,
  ComponentType,
  VNode,
  cloneElement,
  h,
  hydrate,
  render,
} from 'preact'

export type Props = { [key: string]: unknown }

type Values<TObject> = TObject[keyof TObject]
type RequiredOf<TComponentType extends ComponentType<any>> = Omit<
  Required<ComponentProps<TComponentType>>,
  'children'
>
type PropsOf<T> = {
  [P in keyof T]: T[P]
}

type EventsOf<T> = {
  [P in keyof T as T[P] extends (...args: any) => any ? P : never]: T[P]
}

type Names<T> = Values<{
  [P in keyof T]: P | readonly [P, (value: string | null) => T[P]]
}>
type NamesMap<T> = {
  [P in keyof T]?:
    | string
    | ((value: string | null) => T[P])
    | readonly [string, (value: string | null) => T[P]]
}

export type PropNames<TComponentType extends ComponentType<any>> =
  | Names<PropsOf<RequiredOf<TComponentType>>>[]
  | NamesMap<PropsOf<RequiredOf<TComponentType>>>

export type PropEvents<T> = {
  [P in keyof T]?: T[P] extends (...args: infer A) => any
    ? string | ((...args: A) => any) | readonly [string, (...args: A) => any]
    : never
}

export type Options<TComponentType extends ComponentType<any>> = {
  shadow?: boolean
  events?: PropEvents<EventsOf<RequiredOf<TComponentType>>>
}

export type PropsMap = { [key: string]: readonly [string, (value: string | null) => any] }
export type EventsMap = { [key: string]: readonly [string, (...args: any) => any] }

const entries = Object.entries
const from = Object.fromEntries
const isString = (value: any): value is string => typeof value === 'string'
const noop = (value: any) => value
const toArray = <T>(value: ArrayLike<T>): T[] => [].slice.call(value)

class ContextProvider extends Component<any> {
  getChildContext() {
    return this.props.context
  }

  render() {
    const { context, children, ...props } = this.props
    return cloneElement(children, props)
  }
}

class Slot extends Component<any> {
  private _current: any = null
  private _listener = (event: CustomEvent) => {
    event.stopPropagation()
    event.detail.context = this.context
  }
  private _ref = (value: any) => {
    if (!value) {
      this._current.removeEventListener('_preact', this._listener)
    } else {
      if (!this._current) {
        this._current = value
        this._current.addEventListener('_preact', this._listener)
      }
    }
  }

  render() {
    return h('slot', { ...this.props, ref: this._ref })
  }
}

export const map = <T extends Record<string, any>>(
  value: T,
  callback: <Key extends string>(value: T[Key], key: Key) => readonly [string, any],
) => from(entries<T[string]>(value as any).map(([key, value]) => callback(value, key)))

export default function register<TComponentType extends ComponentType<any>>(
  Component: TComponentType,
  tagName?: string,
  propNames?: PropNames<TComponentType>,
  options?: Options<TComponentType>,
) {
  const propsMap: PropsMap = Array.isArray(propNames)
    ? from(
        propNames.map(name =>
          Array.isArray(name) ? [name[0], [name[0], name[1]]] : [name, [name, noop]],
        ),
      )
    : map(propNames ?? {}, (value, key) =>
        Array.isArray(value)
          ? [value[0], [key, value[1]]]
          : isString(value)
          ? [value, [key, noop]]
          : [key, [key, value]],
      )
  const eventsMap: EventsMap = map(options?.events ?? {}, (value, key) =>
    Array.isArray(value)
      ? [key, value]
      : isString(value)
      ? [key, [value, (...args: any[]) => (args.length > 1 ? args : args[0])]]
      : [key, [key, value]],
  )

  const observedAttributes = Object.keys(propsMap)

  class PreactElement extends HTMLElement {
    static get observedAttributes() {
      return observedAttributes
    }

    private _slots: Map<string, null | VNode<any>> = new Map()
    private _root: ShadowRoot | HTMLElement
    private _vnode: VNode<any> | null = null
    private _props: Props = map(eventsMap, ([type, detail], key) => [
      key,
      (...args: any) => {
        this.dispatchEvent(
          new CustomEvent(type, {
            detail: detail(...args),
            bubbles: true,
            cancelable: true,
          }),
        )
      },
    ])
    private _observer: MutationObserver = new MutationObserver((mutations, observer) => {
      const props = from(this._slots)
      this.querySelectorAll('[slot]').forEach(el => {
        const name = el.slot
        if (observedAttributes.includes(name)) {
          this._slots.set(name, null)
          const slot = h(Slot, { name })
          props[propsMap[name][0]] = slot
        }
      })
      if (this._vnode) {
        this._vnode = cloneElement(this._vnode, props)
        render(this._vnode, this._root)
      }
    })

    constructor() {
      super()
      this._root = options?.shadow ? this.attachShadow({ mode: 'open' }) : this

      Object.entries(propsMap).forEach(([name, [attr]]) =>
        Object.defineProperty(this, name, {
          get(this: PreactElement) {
            return this._vnode?.props[name]
          },
          set(this: PreactElement, value: unknown) {
            if (value === null) {
              this.removeAttribute(attr)
            } else if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            ) {
              this.setAttribute(attr, `${value}`)
            } else {
              this._setProp(name, value)
            }
          },
        }),
      )
    }

    connectedCallback() {
      const event = new CustomEvent<{ context?: any }>('_preact', {
        detail: {},
        bubbles: true,
        cancelable: true,
      })
      this.dispatchEvent(event)
      const context = event.detail.context

      const children = h(
        Component,
        from(toArray(this.attributes).map(a => [a.name, a.value])),
        h(Slot, null),
      )

      this._vnode = h(ContextProvider, { ...this._props, context }, children)
      this._observer.observe(this, { childList: true })

      this.hasAttribute('hydrate')
        ? hydrate(this._vnode, this._root)
        : render(this._vnode, this._root)
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
      const [prop, toValue] = propsMap[name] ?? [name, value => value]
      this._setProp(prop, toValue(newValue))
    }

    private _setProp(name: string, value: unknown) {
      const oldValue = this._vnode ? this._vnode.props[name] : this._props[name]
      if (oldValue === value) {
      } else if (this._vnode) {
        this._vnode = cloneElement(this._vnode, { [name]: value })
        render(this._vnode, this._root)
      } else {
        this._props[name] = value
      }
    }

    disconnectedCallback() {
      this._observer.disconnect()
      this._vnode = null
      render(null, this._root)
    }
  }

  return customElements.define(tagName || Component.displayName || Component.name, PreactElement)
}
