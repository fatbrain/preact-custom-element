# @fatbrain/preact-custom-element

Web components custom element wrapper for preact components.

## Example

```ts
import register from '@fatbrain/preact-custom-element'
import { ComponentChildren } from 'preact'
import { useCallback } from 'preact/hooks'

type PersonProps = {
  name: string
  age?: number
  onSay?: (when: Date, message: string) => void
  children: ComponentChildren
}

const Person = ({ age, children, name, onSay }: PersonProps) => {
  const handleClick = useCallback(() => onSay?.(new Date(), 'dumdidum...'), [])
  return <div>
    <ul>
      <li>name: {name ?? <i>no name</i>}</li>
      <li>age: {age ?? <i>no age</i>}</li>
    </ul>
    {children}
    <button type={type} onClick={handleClick}>Say something...<button>
  </div>
}
```

Lets register the `Person` component as a custom element, observing the `age`
and `name` attribute and registering the `onSay` callback as a **custom event**
named `x-say`.

```ts
register(Person, 'x-person', ['age', 'name'], {
  shadow: true,
  events: { onSay: 'x-say' },
})
```

If needed, transform `onSay` arguments for the custom events `details` to some
other value, and also remap attribute `age` to `x-age`

```ts
register(Person, 'x-person', { age: 'x-age', name: 'name' }, {
    shadow: true,
    events: {
      onSay: ['x-say', (when, message) =>
        `${message}, at timestamp ${when.getTime()}`
      ],
    },
  },
)
```

If needed, transform `age` attribute values.

```ts
register(Person, 'x-person', [['age', value => value / 2]], {
  shadow: true,
  events: {
    onSay: 'x-say',
  },
})
```
