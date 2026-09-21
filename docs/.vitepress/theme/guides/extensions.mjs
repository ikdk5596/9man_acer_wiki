import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import { safeLink } from './content.mjs'

// HTML pasted from other sites cannot introduce remote images or tracking URLs.
const PrivateImage = Image.extend({ parseHTML() { return [] } })
export function guideExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: false, linkOnPaste: false, protocols: ['http', 'https'], isAllowedUri: safeLink, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } } }),
    PrivateImage.configure({ allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }), TextStyle, Color,
  ]
}
