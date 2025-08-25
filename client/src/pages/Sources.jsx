import React, { useEffect, useState } from "react";
import { Table, Typography } from "antd";

const { Title } = Typography;

export default function Sources() {
    const [rows, setRows] = useState([]);

    useEffect(() => {
        fetch("/api/sources")
            .then((r) => r.json())
            .then((d) => setRows(d.items || []))
            .catch(() => setRows([]));
    }, []);

    return (
        <div>
            <Title level={4}>Indexed Sources</Title>
            <Table
                rowKey={(r) => r.source}
                dataSource={rows}
                pagination={{ pageSize: 8 }}
                columns={[
                    { title: "Source", dataIndex: "source" },
                    { title: "Title", dataIndex: "title" },
                    { title: "Chunks", dataIndex: "chunks", width: 100 },
                ]}
            />
        </div>
    );
}
