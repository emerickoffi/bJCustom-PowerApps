declare module 'hellosign-embedded' {
  type OpenOptions = {
    testMode?: boolean
    skipDomainVerification?: boolean
    allowCancel?: boolean
    locale?: string
  }
  export default class HelloSign {
    constructor(options: { clientId: string })
    open(url: string, options?: OpenOptions): void
    close(): void
    on(event: 'sign' | 'close' | 'cancel' | 'decline' | 'error' | 'finish' | 'ready', handler: (data?: unknown) => void): void
  }
}
