import { createContext } from "react"

import type { BlogCard } from "./blog"

/**
 * The site's live blog posts, newest first, for the "Latest posts" section.
 * The edge fills it on every render; the editor preview fills it and sets
 * `preview`, so an empty section shows a placeholder there and nothing on
 * the site.
 */
export const PostsContext = createContext<{ posts: BlogCard[]; preview: boolean }>({ posts: [], preview: false })
