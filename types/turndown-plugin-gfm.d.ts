// @joplin/turndown-plugin-gfm은 타입 정보를 제공하지 않아서 직접 선언합니다.
declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
}
