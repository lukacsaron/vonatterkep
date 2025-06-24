import Image from 'next/image';
import Link from 'next/link';
import { Linkedin, Mail, Train, Heart } from 'lucide-react';
import { Navbar } from '@/app/components/UI/Navbar';

export default function KiVagyokPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Navbar />
      
      <main className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-4xl mx-auto px-4 py-16">
          {/* Header Section */}
          <div className="text-center mb-16">
            <div className="relative w-32 h-32 mx-auto mb-6">
              <Image
                src="/aron.jpg"
                alt="Áron Lukács"
                fill
                className="rounded-full object-cover border-4 border-white shadow-lg"
              />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Szia! Áron vagyok 👋
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Egy hobbicoder, aki látva a Holavonat.hu körüli felhajtást és a Vonatinfó hiányát, 
              úgy döntött, hogy ő is készít egy alternatívát. 😅
            </p>
          </div>

          {/* Main Content */}
          <div className="grid md:grid-cols-2 gap-12 mb-16">
            {/* Story */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-center mb-6">
                <Train className="h-6 w-6 text-blue-600 mr-3" />
                <h2 className="text-2xl font-semibold text-gray-900">A történet röviden</h2>
              </div>
              <p className="text-gray-700 leading-relaxed mb-6">
                Amikor a MÁV szombaton lelőtte a Vonatinfót, és láttam, hogy mások is próbálkoznak pótolni 
                (mint a Holavonat.hu készítői), úgy döntöttem, én is megpróbálom.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Mert mi mást csinálna az ember, mint hogy csatlakozzon azokhoz, akik hiányzó közszolgáltatásokat 
                pótolnak a hétvégén?
              </p>
            </div>

            {/* Work */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-center mb-6">
                <Heart className="h-6 w-6 text-red-500 mr-3" />
                <h2 className="text-2xl font-semibold text-gray-900">Mit csinálok amúgy</h2>
              </div>
              <p className="text-gray-700 leading-relaxed mb-6">
                Napközben a LogiNet International-nél és a <a href="https://22.design" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">22.design</a>-nál segítek cégeknek abban, hogy hatékonyabban használják ki az AI és a digitalizáció lehetőségeit és ezáltal árbevételt növeljenek. UX-et fordítok ROI-ra (sic!), marketing kampányokat vezetek, 
                és időnként még frontend kódot is írok.
              </p>
              <p className="text-gray-700 leading-relaxed">
                De a szívem mélyén mindig is a vasúti térképek szerelmese voltam. 🚂
              </p>
            </div>
          </div>

          {/* Why Section */}
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Miért csináltam ezt?</h2>
            <div className="prose prose-lg text-gray-700 max-w-none">
              <p className="leading-relaxed mb-6">
                Mert egyszerűen bosszantó volt, hogy egy olyan hasznos szolgáltatás, mint a Vonatinfó, 
                egyik napról a másikra eltűnik. És látva a Holavonat.hu körüli politikai felhajtást, 
                úgy gondoltam, én is megpróbálom - hátha sikerül egy kevésbé vitatott alternatívát készíteni.
              </p>
              <p className="leading-relaxed mb-6">
                Nem politikai motiváció vezérelt, nem vagyok se fanatikus aktivista (csak sima), se a MÁV ellensége. 
                Csak valaki, aki azt gondolja, hogy az utasoknak joguk van tudni, hol jár a vonatuk.
              </p>
              <p className="leading-relaxed">
                Hiszek abban, hogy a technológia a közjó része kell, hogy legyen, és hogy a polgárok is hozzájárulhatnak a 
                közszolgáltatások javításához - még ha ez néha kényes politikai kérdéseket is felvet.
              </p>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white mb-12">
            <h2 className="text-2xl font-semibold mb-4">Tech stack és filozófia</h2>
            <p className="text-blue-100 leading-relaxed">
              A VonatTérkép modern webtechnológiákra épül, gyors, responsive, és tiszteletben tartja a MÁV 
              rendszereit (percenként maximum egyszer kérdezzük le az adatokat).
            </p>
          </div>

          {/* Contact */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-8">Kapcsolat</h2>
            <div className="flex justify-center space-x-6">
              <Link
                href="mailto:aron.lukacs@gmail.com"
                className="flex items-center px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Mail className="h-5 w-5 mr-2" />
                Email
              </Link>
              <Link
                href="https://www.linkedin.com/in/lukacsaron/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Linkedin className="h-5 w-5 mr-2" />
                LinkedIn
              </Link>
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-16 text-center">
            <p className="text-gray-500 italic">
              PS: Igen, ez egy hobbi projekt. Igen, vannak még hibák. Igen, dolgozom rajtuk. 
              Nem, nem vagyok fizetett ügynök. 😄
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}