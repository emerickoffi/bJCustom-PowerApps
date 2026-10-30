export default function ClientsLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
