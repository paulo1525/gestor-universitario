"use client";
import {Clock3} from "lucide-react";
import {AuthGuard} from "@/components/auth-guard";
export default function FormacaoEmCurso(){return <AuthGuard allowDuringMaintenance><main className="auth-loading"><Clock3 size={32}/><h1>Formação inicial em curso</h1><p>A formação inicial das turmas encontra-se em curso. O acesso às turmas e às preferências ficará disponível após o encerramento desta fase.</p></main></AuthGuard>}
