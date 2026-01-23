export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          Evento no encontrado
        </h2>
        <p className="text-gray-600 mb-6">
          El evento que buscas no existe o el link es incorrecto.
        </p>
      </div>
    </div>
  );
}
