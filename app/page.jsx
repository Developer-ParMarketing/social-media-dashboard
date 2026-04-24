import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-gray-200 flex flex-col items-center justify-center px-4">

      {/* Heading */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-3">
          Marketing Dashboard
        </h1>
        <p className="text-gray-500 text-sm md:text-base">
          Manage and analyze your marketing performance in one place
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-2xl">

        {/* Facebook Card */}
        <Link href="/accounts">
          <div className="group bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-500 hover:scale-[1.02]">

            {/* Icon + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">ⓕ</div>
              <h2 className="text-2xl font-semibold text-gray-800">
                Facebook Insights
              </h2>
            </div>

            {/* Description */}
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Track accounts, campaigns, performance metrics, and tasks.
              Get a complete overview of your Facebook marketing activity.
            </p>

            {/* CTA */}
            <div className="flex items-center justify-between">
              <span className="text-blue-600 font-medium text-sm group-hover:underline">
                Open Dashboard
              </span>
              <span className="text-blue-600 text-lg transform group-hover:translate-x-1 transition">
                →
              </span>
            </div>

          </div>
        </Link>

        {/* Divider */}
        <div className="flex items-center my-8">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-4 text-gray-400 text-xs uppercase tracking-wider">
            Optional
          </span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        {/* Instagram Button */}
        <div className="flex justify-center">
          <Link href="/instagram">
            <button className="flex items-center gap-2 px-6 py-2.5 text-sm rounded-full border border-pink-400 text-pink-500 
            hover:bg-pink-50 hover:shadow-md transition-all duration-300 hover:scale-105">
              📸 Instagram Insights
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}