"use client";
import { useEffect, useState } from "react";
import API from "@/services/api";
import Table from "@/components/Table";

export default function AdsPage() {
    const [data, setData] = useState([]);

    useEffect(() => {
        API.get("/ads/insights").then((res) => {
            setData(res.data);
        });
    }, []);

    return (
        <div>
            <h2>Ads Insights</h2>
            <Table data={data} />
        </div>
    );
}