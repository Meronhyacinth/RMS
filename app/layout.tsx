import type {Metadata} from 'next';
export const metadata:Metadata={title:'Recruit Centinel',description:'Hiring requests, approvals and recruitment progress in one secure workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body style={{margin:0}}>{children}</body></html>}
