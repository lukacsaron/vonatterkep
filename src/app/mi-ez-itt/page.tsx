import { Metadata } from 'next';
import Link from 'next/link';
import { 
  MapPin, 
  Clock, 
  Search, 
  Train, 
  Smartphone, 
  Zap, 
  Eye, 
  Navigation,
  Shield,
  Users
} from 'lucide-react';
import { Navbar } from '@/app/components/UI/Navbar';

export const metadata: Metadata = {
  title: 'Mi ez itt? - VasútTérkép | Magyar vonatkövetés élőben',
  description: 'Tudj meg mindent a VasútTérkép alkalmazásról: élő vonatkövetés, késésinfók, útvonaltervezés és állomási menetrendek Magyarországon.',
  keywords: [
    'VasútTérkép',
    'mi ez itt',
    'vonatkövetés',
    'MÁV',
    'vasút információ',
    'vonat térkép',
    'késés információ',
    'menetrend',
    'holavonat alternatíva',
    'vonatinfó pótlás'
  ],
  openGraph: {
    title: 'Mi ez itt? - VasútTérkép alkalmazás bemutató',
    description: 'Fedezd fel a VasútTérkép funkcióit: élő vonatkövetés, késésinfók és útvonaltervezés.',
    type: 'article',
    locale: 'hu_HU',
    url: '/mi-ez-itt',
    images: [
      {
        url: '/og-info.png',
        width: 1200,
        height: 630,
        alt: 'VasútTérkép alkalmazás funkciói',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mi ez itt? - VasútTérkép',
    description: 'Minden, amit a VasútTérkép alkalmazásról tudni kell.',
    images: ['/og-info.png'],
  },
  robots: 'index, follow',
  alternates: {
    canonical: '/mi-ez-itt',
  },
};

export default function MiEzIttPage() {
  return (
    <>
      {/* Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "VasútTérkép",
            "description": "Élő vonatkövetés és vasúti információs rendszer Magyarországon",
            "url": "https://vonatterkep.app.jazzrabbit.eu",
            "applicationCategory": "TransportationApplication",
            "operatingSystem": "Web Browser",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "HUF"
            },
            "author": {
              "@type": "Person",
              "name": "Áron Lukács"
            },
            "datePublished": "2024-12-01",
            "inLanguage": "hu-HU",
            "featureList": [
              "Élő vonatkövetés térképen",
              "Késési információk",
              "Állomási menetrendek",
              "Globális keresés",
              "Mobil-optimalizált felület",
              "Valós idejű frissítések"
            ]
          })
        }}
      />

      <div className="flex flex-col min-h-screen bg-white">
        <Navbar />
        
        <main className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Header Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-600 rounded-full mb-6">
                <Train className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Mi ez itt?
              </h1>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                A <strong>VasútTérkép</strong> egy modern, nyílt forrású webalkalmazás, amely 
                valós időben követi a magyar vonatokat és segít az utazástervezésben.
              </p>
            </div>

            {/* Main Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <MapPin className="h-8 w-8 text-blue-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Élő vonatkövetés</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Láthatod térképen, hogy éppen hol járnak a vonatok Magyarországon, 
                  milyen sebességgel haladnak és merre tartanak.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <Clock className="h-8 w-8 text-orange-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Késési információk</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Percre pontos késési adatok, hogy előre tudd, mikor érkezik meg a vonatod 
                  az állomásra.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <Search className="h-8 w-8 text-green-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Globális keresés</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Gyors keresés vonatszámra, útvonalra vagy állomásra. 
                  Használd a <kbd className="px-2 py-1 bg-gray-100 rounded text-sm">Cmd+K</kbd> billentyűkombinációt!
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <Navigation className="h-8 w-8 text-purple-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Állomási menetrendek</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Minden állomás részletes menetrendje indulásokkal, érkezésekkel és vágányinfókkal.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <Smartphone className="h-8 w-8 text-pink-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Mobil-optimalizált</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Tökéletesen használható telefonon és tableten is. Gyors, responsive felület.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <Zap className="h-8 w-8 text-yellow-600 mr-3" />
                  <h3 className="text-xl font-semibold text-gray-900">Valós idejű</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Az adatok percenként frissülnek a MÁV-tól, így mindig aktuális információkat látsz.
                </p>
              </div>
            </div>

            {/* What You Can See Section */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 mb-12">
              <div className="flex items-center mb-6">
                <Eye className="h-8 w-8 text-blue-600 mr-3" />
                <h2 className="text-3xl font-semibold text-gray-900">Mit láthatsz itt?</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">A térképen</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Minden éppen közlekedő vonat pozíciója</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Vonatszámok és típusok (IC, EC, Railjet, stb.)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Jelenlegi sebesség és irány</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Útvonal kezdő- és végállomása</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Késési információk percben</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Az állomásoknál</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Indulások és érkezések listája</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Vágányinformációk</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Célállomások</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Pontosság vagy késés jelzése</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Vonat típusa és száma</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Purpose Section */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white mb-12">
              <div className="flex items-center mb-6">
                <Users className="h-8 w-8 text-blue-200 mr-3" />
                <h2 className="text-3xl font-semibold">Miért készült ez az alkalmazás?</h2>
              </div>
              <div className="prose prose-lg text-blue-100 max-w-none">
                <p className="leading-relaxed mb-6">
                  A VasútTérkép azért jött létre, hogy <strong className="text-white">minden utas számára elérhető legyen</strong> 
                  a valós idejű vasúti információ. Célunk, hogy segítsük az utasokat az utazástervezésben és 
                  hogy mindenki időben értesüljön a változásokról.
                </p>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-3">Az utasokért</h3>
                    <p className="text-blue-100">
                      Hogy ne kelljen találgatni, mikor érkezik a vonat. Hogy előre tudd tervezni az átszállásokat. 
                      Hogy lásd, ha késik a járat, és alternatívát kereshess.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-3">Nyílt hozzáféréssel</h3>
                    <p className="text-blue-100">
                      Hiszünk abban, hogy a közlekedési információknak közösek kell lenniük. 
                      Az alkalmazás ingyenes és nyílt forráskódú.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Info */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 mb-12">
              <div className="flex items-center mb-6">
                <Shield className="h-8 w-8 text-gray-600 mr-3" />
                <h2 className="text-3xl font-semibold text-gray-900">Technikai információk</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Adatok forrása</h3>
                  <p className="text-gray-700 mb-4">
                    Az alkalmazás a <strong>MÁV hivatalos API-jait</strong> használja:
                  </p>
                  <ul className="space-y-2 text-gray-700">
                    <li>• EMMA GraphQL API - élő vonatkövető adatok</li>
                    <li>• MobileService REST API - menetrendek, állomások</li>
                    <li>• Percenként frissülő információk</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Adatvédelem</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>• Nem tárolunk személyes adatokat</li>
                    <li>• Csak a szükséges cookie-kat használjuk</li>
                    <li>• Tiszteletben tartjuk a MÁV rendszereit</li>
                    <li>• Rate limiting: max. 1 kérés/perc</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Próbáld ki most!</h2>
              <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                Kezdj el böngészni a térképen, keress rá egy vonatra, vagy nézd meg egy állomás menetrendjét.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <MapPin className="h-5 w-5 mr-2" />
                  Böngészd a térképet
                </Link>
                <Link
                  href="/search"
                  className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                >
                  <Search className="h-5 w-5 mr-2" />
                  Keresés indítása
                </Link>
              </div>
            </div>

            {/* Footer Note */}
            <div className="mt-16 text-center border-t border-gray-200 pt-8">
              <p className="text-gray-500">
                Van kérdésed vagy észrevételed? Írj a készítőnek: 
                <Link href="/ki-vagyok" className="text-blue-600 hover:text-blue-800 ml-1 underline">
                  Ki vagyok én?
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}