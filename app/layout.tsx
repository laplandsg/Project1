import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Cedric's IO chart",
  description: "Baby tracking simplified.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#FAF9F6] text-stone-800 antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}