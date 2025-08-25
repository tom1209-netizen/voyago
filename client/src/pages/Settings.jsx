import React, { useEffect, useState } from "react";
import {
    Form,
    InputNumber,
    Typography,
    Button,
    Space,
    message as toast,
} from "antd";

const { Title, Text } = Typography;

export default function Settings() {
    const [form] = Form.useForm();
    const [initial, setInitial] = useState({ temperature: 0.2, retrievalK: 4 });

    useEffect(() => {
        const saved = localStorage.getItem("appSettings");
        if (saved) setInitial(JSON.parse(saved));
        form.setFieldsValue(saved ? JSON.parse(saved) : initial);
    }, []);

    const onSave = (values) => {
        localStorage.setItem("appSettings", JSON.stringify(values));
        toast.success("Saved");
    };

    return (
        <div>
            <Title level={4}>Settings (client-only)</Title>
            <Form
                form={form}
                layout="vertical"
                initialValues={initial}
                onFinish={onSave}
                style={{ maxWidth: 420 }}
            >
                <Form.Item
                    label="Temperature"
                    name="temperature"
                    tooltip="0 = deterministic, 1 = creative"
                >
                    <InputNumber
                        min={0}
                        max={1}
                        step={0.1}
                        style={{ width: "100%" }}
                    />
                </Form.Item>
                <Form.Item
                    label="Retrieval K"
                    name="retrievalK"
                    tooltip="How many chunks to retrieve"
                >
                    <InputNumber
                        min={1}
                        max={10}
                        step={1}
                        style={{ width: "100%" }}
                    />
                </Form.Item>
                <Space>
                    <Button type="primary" htmlType="submit">
                        Save
                    </Button>
                    <Button
                        onClick={() => {
                            localStorage.removeItem("appSettings");
                            window.location.reload();
                        }}
                    >
                        Reset
                    </Button>
                </Space>
                <div style={{ marginTop: 12 }}>
                    <Text type="secondary">
                        Preferences are stored in your browser only.
                    </Text>
                </div>
            </Form>
        </div>
    );
}
