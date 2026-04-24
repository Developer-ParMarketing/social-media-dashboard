"use client";

import { useState } from "react";

export default function Table({ data, onAction }) {
    const [selectedRow, setSelectedRow] = useState(null);

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500">
                No Data Available
            </div>
        );
    }

    const keys = Object.keys(data[0]);

    const formatValue = (value) => {
        if (value === null || value === undefined) return "-";

        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        return value.toString();
    };

    return (
        <div className="w-full">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl shadow border">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            {keys.map((key) => (
                                <th
                                    key={key}
                                    className="px-4 py-3 font-semibold text-gray-700 uppercase tracking-wide"
                                >
                                    {key}
                                </th>
                            ))}
                            {onAction && (
                                <th className="px-4 py-3 text-gray-700">Actions</th>
                            )}
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {data.map((row, i) => (
                            <tr
                                key={i}
                                className="hover:bg-gray-50 transition duration-150"
                            >
                                {keys.map((key) => (
                                    <td
                                        key={key}
                                        className="px-4 py-3 text-gray-600 max-w-50 truncate"
                                    >
                                        {formatValue(row[key])}
                                    </td>
                                ))}

                                {onAction && (
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => onAction(row)}
                                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs"
                                        >
                                            View
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile View (Card Layout) */}
            <div className="md:hidden space-y-4">
                {data.map((row, i) => (
                    <div
                        key={i}
                        className="border rounded-xl p-4 shadow-sm bg-white"
                    >
                        {keys.map((key) => (
                            <div key={key} className="flex justify-between py-1">
                                <span className="text-gray-500 text-sm">{key}</span>
                                <span className="text-gray-800 text-sm text-right max-w-[60%] truncate">
                                    {formatValue(row[key])}
                                </span>
                            </div>
                        ))}

                        {onAction && (
                            <button
                                onClick={() => onAction(row)}
                                className="mt-3 w-full bg-blue-500 text-white py-2 rounded-lg"
                            >
                                View Details
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}