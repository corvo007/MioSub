import HomePage from './HomePage';

export function generateStaticParams() {
  return [{ lang: 'zh' }, { lang: 'en' }];
}

export default function Page() {
  return <HomePage />;
}
