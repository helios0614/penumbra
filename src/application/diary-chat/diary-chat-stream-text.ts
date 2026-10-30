/** Display filtering only. Never executes commands or changes persisted history. */
export function diaryStreamText(raw: string) {
  let content = "", thinking = "", drift = "", cursor = 0;
  const markers = ["[THINKING_START]", "[THINKING_END]", "[DRIFT:", "[SIMPLETHINK:",
    "[ReadOriginalDialogue:", "[NextGroup]", "[HEART:", "[MEMORY_WRITE:", "[ALARM:",
    "[REMINDER:", "[Monitor:", "[SCHEDULE_DEL:", "[SCHEDULE_LIST]", "[TODO:", "[TODO_DONE:"];
  while (cursor < raw.length) {
    const rest = raw.slice(cursor);
    const marker = markers.find(value => rest.startsWith(value));
    if (!marker) {
      if (markers.some(value => value.startsWith(rest))) break;
      content += raw[cursor++]; continue;
    }
    if (marker === "[THINKING_START]") {
      const end = raw.indexOf("[THINKING_END]", cursor + marker.length);
      let body = raw.slice(cursor + marker.length, end < 0 ? undefined : end);
      if (end < 0) {
        for (let n = Math.min(body.length, 14); n > 0; n--) if ("[THINKING_END]".startsWith(body.slice(-n))) { body = body.slice(0, -n); break; }
      }
      thinking += body;
      if (end < 0) break;
      cursor = end + "[THINKING_END]".length; continue;
    }
    if (marker.endsWith(":")) {
      const end = raw.indexOf("]", cursor + marker.length);
      if (marker === "[DRIFT:" || marker === "[SIMPLETHINK:") drift += raw.slice(cursor + marker.length, end < 0 ? undefined : end);
      if (end < 0) break;
      cursor = end + 1;
    } else cursor += marker.length;
  }
  return { content, thinking: thinking || null, drift: drift || null };
}
