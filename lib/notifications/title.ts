// Most notify() messages already read as "headline — detail" (see the
// wording audit in docs/agents — e.g. "QA complete for PN-1042 —
// dispatching to stakeholders now."). Splitting on the first " — " gives a
// reasonable default toast/tray headline for call sites that don't pass an
// explicit `title`; messages without that separator fall back to using the
// full message as the title, which render() treats as "no separate subtitle".
export function deriveTitleFromMessage(message: string): string {
  const sepIndex = message.indexOf(" — ");
  return sepIndex === -1 ? message : message.slice(0, sepIndex);
}
