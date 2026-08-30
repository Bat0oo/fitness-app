import { useDraggable } from '@dnd-kit/core'

export default function LibraryItem({ name }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib-${name}`,
    data: { name },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`lib-item ${isDragging ? 'dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      {name}
    </div>
  )
}
