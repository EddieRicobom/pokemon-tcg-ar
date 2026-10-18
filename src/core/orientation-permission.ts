interface PermissionEventClass {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Deve ser chamada diretamente pelo clique no iOS, antes de qualquer carregamento assíncrono. */
export async function requestOrientationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const Ctor = (window as unknown as { DeviceOrientationEvent?: PermissionEventClass }).DeviceOrientationEvent;
  if (!Ctor) return 'unsupported';
  if (typeof Ctor.requestPermission !== 'function') return 'granted';
  try {
    return (await Ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
