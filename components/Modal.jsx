"use client";

export default function Modal({ isOpen, onClose, data }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">

            <div className="bg-white w-full max-w-lg rounded-2xl shadow-lg p-6 relative">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-500 hover:text-black"
                >
                    ✖
                </button>

                {/* Title */}
                <h2 className="text-xl font-semibold mb-4 text-black">
                    📊 Media Insights
                </h2>

                {/* Content */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto text-sm">
                    {data && data.length > 0 ? (
                        data.map((item, index) => (
                            <div
                                key={index}
                                className="flex justify-between border-b pb-2"
                            >
                                <span className="text-gray-500">
                                    {item.name}
                                </span>
                                <span className="font-medium text-gray-800">
                                    {item.values?.[0]?.value ?? "-"}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No insights available</p>
                    )}
                </div>

            </div>
        </div>
    );
}