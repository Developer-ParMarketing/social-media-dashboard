"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/services/api";

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const router = useRouter();

    useEffect(() => {
        API.get("/facebook/accounts").then((res) => {
            setAccounts(res.data);
        });
    }, []);

    const handleClick = (id, token) => {
        router.push(`/accounts/${id}?token=${token}`);
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl font-semibold mb-6">
                Facebook Accounts
            </h1>

            <div className="overflow-x-auto bg-white rounded-xl shadow">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-200 text-gray-700 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Page ID</th>
                            <th className="px-4 py-3">Category</th>
                            <th className="px-4 py-3">Tasks</th>
                        </tr>
                    </thead>

                    <tbody>
                        {accounts.map((acc) => (
                            <tr
                                key={acc.id}
                                onClick={() =>
                                    router.push(`/accounts/${acc.id}?token=${acc.access_token}`)
                                }
                                className="border-b hover:bg-gray-100 cursor-pointer"
                            >
                                <td className="px-4 py-3 font-medium">
                                    {acc.name}
                                </td>

                                <td className="px-4 py-3 text-gray-600">
                                    {acc.id}
                                </td>

                                <td className="px-4 py-3">
                                    {acc.category}
                                </td>

                                <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {acc.tasks?.map((task, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded"
                                            >
                                                {task}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}