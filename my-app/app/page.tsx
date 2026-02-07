import Image from "next/image";
import Link from "next/link";
import {auth} from "../auth"
import { startOnboarding } from "../app/api/actions/startOnboarding";

export default async function Home() {
  const session = await auth();
  
    // const router = useRouter();
  
    // const handleGetStarted = async () => {
    //   // create guest user + profile
    //   await fetch("/api/onboarding/start", { method: "POST" });
  
    //   router.push("/questions/step2");
    // };
  return (
    <div className="flex min-h-screen items-center justify-center flex-col bg-zinc-50 font-sans text-black">
          {/* NAV */}
      <main className="flex min-h-screen w-full  flex-col items-center justify-between pb-10 px-1 sm:items-start">
        {/* <Image
          className=""
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        /> */}
     

    

        {/* HERO */}
        <section className="grid grid-cols-2 gap-10 px-16 py-20 items-center">
        <div>
        <h1 className="text-5xl font-bold leading-tight">
        Cast a wider net — 10x your job applications
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-xl">
        Our AI-powered job search automation platform continuously finds and
        applies to relevant job openings until you're hired.
        </p>
        <form action={startOnboarding}>
          <button
            type="submit"
            className="inline-block mt-8 bg-blue-600 text-white px-6 py-3 rounded-full font-medium"
          >
            Get Started →
          </button>
        </form>
      
        </div>



<Image src="https://iili.io/fixei4s.md.png" alt="" width={200} height={200} unoptimized />


        </section>

          {/* LOGOS */}
          <section className="px-16 py-10 border-t border-b w-full">
          <p className="text-sm mb-4">Top companies hiring</p>
          <div className="flex gap-10 opacity-70 w-full justify-between">
          {["Peloton", "American Express", "New York Life", "YETI", "HubSpot"].map(
          (logo) => (
          <div key={logo} className="font-semibold">
          {logo}
          </div>
          )
          )}
          </div>
          </section>

        {/* HOW IT WORKS */}
        <section className="px-16 py-20 text-center w-full">
        <h2 className="text-3xl font-bold">
        Save time — skip the job application process
        </h2>


        <div className="grid grid-cols-3 gap-8 mt-12 w-full ">
        {[
        "We get to know you",
        "We find jobs for you",
        "We apply for you",
        ].map((title) => (
        <div
        key={title}
        className="p-6 rounded-xl bg-gradient-to-br from-indigo-50 to-pink-50"
        >
        <p className="font-medium">{title}</p>
        <div className="mt-6 h-32 bg-white rounded-lg shadow-sm"></div>
        </div>
        ))}
        </div>

          <Link href="/questions"  className="mt-12 bg-blue-600 text-white px-6 py-3 rounded-full">
            
          Get Started →
          
          </Link>
      

        </section>

        {/* VALUE PROPS */}
        <section className="px-16 py-20 grid grid-cols-4 gap-6">
        {[
        {
        title: "Automate your job search",
        desc: "We continuously scan millions of openings.",
        },
        {
        title: "Wake up to your best matches",
        desc: "Daily curated roles matched to you.",
        },
        {
        title: "10x your job applications",
        desc: "Submit more with less effort.",
        },
        {
        title: "Reclaim valuable hours every week",
        desc: "Let AI handle the grind.",
        },
        ].map((item) => (
        <div key={item.title} className="border rounded-xl p-6">
        <h3 className="font-semibold mb-2">{item.title}</h3>
        <p className="text-sm text-gray-600">{item.desc}</p>
        </div>
        ))}
        </section>

        {/* RECENT JOBS */}
        <section className="px-16 py-20">
        <h2 className="text-2xl font-bold mb-8">Recent Jobs</h2>


        <div className="grid grid-cols-4 gap-6">
        {[
        "Vice President, Data Governance",
        "Service Advisor",
        "Road Service Mechanic",
        "Furniture Salesman"
        ].map((job) => (
        <div key={job} className="border rounded-xl p-6">
        <p className="font-medium mb-2">{job}</p>
        <p className="text-sm text-gray-500 mb-4">
        Posted 5 days ago
        </p>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm">
        Apply →
        </button>
        </div>
        ))}
        </div>
        </section>

        {/* CTA */}
        <section className="flex text-center flex-col  w-3/4 mx-auto bg-indigo-900 text-white rounded-2xl py-16 text-center">
        <h2 className="text-3xl font-bold mb-6">
        Ready to automate your job search?
        </h2>
        <button className="bg-blue-500 mx-auto w-1/4 px-6 py-3 rounded-full font-medium">
        Find jobs →
        </button>
        </section>

      
      </main>
        {/* FOOTER */}
        <footer className="px-16 py-12 border-t grid grid-cols-4 gap-8 text-sm bg-amber-500 w-full">
        <div>
        <div className="font-bold mb-4">Hirexa</div>
        <p className="text-gray-500">© 2026</p>
        </div>


        {["Product", "Company", "Jobs", "Support"].map((section) => (
        <div key={section}>
        <p className="font-semibold mb-3">{section}</p>
        <ul className="space-y-2 text-gray-600">
        <li>Overview</li>
        <li>Blog</li>
        <li>Careers</li>
        </ul>
        </div>
        ))}
        </footer>
    </div>
  );
}
