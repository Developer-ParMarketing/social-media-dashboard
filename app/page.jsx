import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center px-4">

      <div className="w-full max-w-4xl">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-5">
            📊 Social Media Analytics
          </div>

          <h1 className="text-5xl font-black text-gray-900 mb-4">
            Marketing Dashboard
          </h1>

          <p className="text-gray-500 max-w-xl mx-auto">
            View account performance, engagement insights, audience growth,
            and social media analytics from a single dashboard.
          </p>
        </div>

        {/* Dashboard Card */}
        <Link href="/accounts">
          <div className="group cursor-pointer">

            <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-lg hover:shadow-2xl hover:border-blue-300 transition-all duration-300">

              {/* Top Gradient */}
              <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />

              <div className="p-8">

                <div className="flex items-start justify-between">

                  <div className="flex gap-4">

                    <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-3xl shadow-lg">
                      f
                    </div>

                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        Facebook Insights
                      </h2>

                      <p className="text-gray-500 mt-1">
                        Analyze page performance, engagement,
                        reach, followers and content metrics.
                      </p>
                    </div>

                  </div>

                  <div className="text-blue-600 text-3xl group-hover:translate-x-2 transition-transform">
                    →
                  </div>

                </div>

                <div className="mt-8 flex flex-wrap gap-3">

                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                    Engagement Analytics
                  </span>

                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                    Monthly Reports
                  </span>

                  <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm font-medium">
                    Audience Insights
                  </span>

                </div>

                <div className="mt-8 flex items-center justify-between">

                  <span className="font-semibold text-blue-600">
                    Open Dashboard
                  </span>

                  <span className="text-sm text-gray-400">
                    Click to continue
                  </span>

                </div>

              </div>

            </div>

          </div>
        </Link>

      </div>

    </div>
  );
}


{/* Divider */ }
{/* <div className="flex items-center my-8">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-4 text-gray-400 text-xs uppercase tracking-wider">
            Optional
          </span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div> */}

{/* Instagram Button */ }
{/* <div className="flex justify-center">
          <Link href="/instagram">
            <button className="flex items-center gap-2 px-6 py-2.5 text-sm rounded-full border border-pink-400 text-pink-500 
            hover:bg-pink-50 hover:shadow-md transition-all duration-300 hover:scale-105">
              📸 Instagram Insights
            </button>
          </Link>
        </div> */} 