"""Quadtree propio · IMPLEMENTACIÓN DEL EQUIPO (RF-03).

Árbol de partición espacial: cada nodo cubre un rectángulo. Cuando una hoja
supera su CAPACIDAD se divide en cuatro cuadrantes (NO, NE, SO, SE) y sus
elementos se reparten entre los hijos.

Clases obligatorias: NodoQuadtree y Quadtree. Métodos en español, snake_case.

Los elementos almacenados deben tener atributos `id`, `x`, `y` (metros en la
proyección local). Se usa para conductores y también para indexar las
intersecciones del grafo vial.

Caso límite: muchos elementos en el MISMO punto (p. ej. la puerta de un centro
comercial). Dividir nunca los separaría, así que no se subdivide si todos los
puntos de la hoja son idénticos, ni más allá de PROFUNDIDAD_MAXIMA o
TAMANO_MINIMO: la hoja queda "desbordada" (guarda más elementos que su
capacidad) y se evita la recursión infinita.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Rectangulo:
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    def __post_init__(self):
        if self.xmin > self.xmax or self.ymin > self.ymax:
            raise ValueError("Rectángulo inválido: el mínimo supera al máximo.")

    def contiene(self, x: float, y: float) -> bool:
        return self.xmin <= x <= self.xmax and self.ymin <= y <= self.ymax

    def intersecta(self, otro: "Rectangulo") -> bool:
        return not (otro.xmax < self.xmin or otro.xmin > self.xmax
                    or otro.ymax < self.ymin or otro.ymin > self.ymax)

    def a_lista(self) -> list[float]:
        return [self.xmin, self.ymin, self.xmax, self.ymax]


@dataclass(eq=False)
class NodoQuadtree:
    limites: Rectangulo
    profundidad: int = 0
    elementos: list = field(default_factory=list)
    hijos: list | None = None  # [NO, NE, SO, SE] o None si es hoja

    def es_hoja(self) -> bool:
        return self.hijos is None

    def centro(self) -> tuple[float, float]:
        r = self.limites
        return (r.xmin + r.xmax) / 2, (r.ymin + r.ymax) / 2

    def indice_hijo(self, x: float, y: float) -> int:
        """0=NO, 1=NE, 2=SO, 3=SE (y crece hacia el norte).

        Un punto exactamente sobre la línea central va al cuadrante este/norte;
        la regla es la misma al insertar, buscar la hoja y eliminar.
        """
        cx, cy = self.centro()
        este = x >= cx
        norte = y >= cy
        if norte:
            return 1 if este else 0
        return 3 if este else 2


class Quadtree:
    def __init__(self, limites: Rectangulo, capacidad: int = 8,
                 profundidad_maxima: int = 16, tamano_minimo: float = 0.5):
        if capacidad < 1:
            raise ValueError("La capacidad debe ser al menos 1.")
        self.raiz = NodoQuadtree(limites)
        self.capacidad = capacidad
        self.profundidad_maxima = profundidad_maxima
        self.tamano_minimo = tamano_minimo
        self._posiciones: dict = {}  # id → (x, y) con la que se indexó
        self.eventos: list | None = None  # registro opcional para animaciones

    # ------------------------------------------------------------------ básicos
    def __len__(self) -> int:
        return len(self._posiciones)

    def esta_vacio(self) -> bool:
        return not self._posiciones

    def contiene_id(self, ident) -> bool:
        return ident in self._posiciones

    def _registrar(self, tipo: str, **datos) -> None:
        if self.eventos is not None:
            self.eventos.append({"tipo": tipo, **datos})

    def _hoja_de(self, x: float, y: float) -> tuple[NodoQuadtree, list]:
        """Desciende hasta la hoja que corresponde a (x, y). Devuelve (hoja, camino)."""
        nodo, camino = self.raiz, [self.raiz]
        while not nodo.es_hoja():
            nodo = nodo.hijos[nodo.indice_hijo(x, y)]
            camino.append(nodo)
        return nodo, camino

    # ------------------------------------------------------------------ insertar
    def insertar(self, elemento) -> None:
        """Inserta un elemento con atributos id, x, y.  Costo O(profundidad)."""
        if elemento.id in self._posiciones:
            raise ValueError(f"El elemento {elemento.id} ya está en el Quadtree.")
        if not self.raiz.limites.contiene(elemento.x, elemento.y):
            raise ValueError(
                f"El punto ({elemento.x:.1f}, {elemento.y:.1f}) está fuera de los límites.")
        hoja, _ = self._hoja_de(elemento.x, elemento.y)
        hoja.elementos.append(elemento)
        self._posiciones[elemento.id] = (elemento.x, elemento.y)
        self._registrar("insertar", id=elemento.id, x=elemento.x, y=elemento.y,
                        nodo=hoja.limites.a_lista())
        if len(hoja.elementos) > self.capacidad:
            self._subdividir(hoja)

    def _subdividir(self, nodo: NodoQuadtree) -> None:
        r = nodo.limites
        lado = min(r.xmax - r.xmin, r.ymax - r.ymin)
        primero = nodo.elementos[0]
        todos_iguales = all(e.x == primero.x and e.y == primero.y for e in nodo.elementos)
        if (nodo.profundidad >= self.profundidad_maxima or lado / 2 < self.tamano_minimo
                or todos_iguales):
            # Hoja desbordada: se aceptan más elementos que la capacidad.
            self._registrar("desborde", nodo=r.a_lista(), cantidad=len(nodo.elementos))
            return
        cx, cy = nodo.centro()
        p = nodo.profundidad + 1
        nodo.hijos = [
            NodoQuadtree(Rectangulo(r.xmin, cy, cx, r.ymax), p),  # NO
            NodoQuadtree(Rectangulo(cx, cy, r.xmax, r.ymax), p),  # NE
            NodoQuadtree(Rectangulo(r.xmin, r.ymin, cx, cy), p),  # SO
            NodoQuadtree(Rectangulo(cx, r.ymin, r.xmax, cy), p),  # SE
        ]
        self._registrar("subdividir", nodo=r.a_lista(), profundidad=nodo.profundidad,
                        hijos=[h.limites.a_lista() for h in nodo.hijos])
        elementos, nodo.elementos = nodo.elementos, []
        for e in elementos:
            nodo.hijos[nodo.indice_hijo(e.x, e.y)].elementos.append(e)
        for hijo in nodo.hijos:
            if len(hijo.elementos) > self.capacidad:
                self._subdividir(hijo)

    # ------------------------------------------------------------------ eliminar
    def eliminar(self, elemento) -> bool:
        """Elimina por id usando la posición con la que se indexó.

        Devuelve True si se eliminó y False si no existía. Después, si los cuatro
        hijos de un nodo son hojas y juntos caben en la capacidad, se fusionan,
        para que el árbol no crezca indefinidamente cuando los conductores se mueven.
        """
        ident = elemento.id if hasattr(elemento, "id") else elemento
        if ident not in self._posiciones:
            return False
        x, y = self._posiciones.pop(ident)
        hoja, camino = self._hoja_de(x, y)
        for i, e in enumerate(hoja.elementos):
            if e.id == ident:
                hoja.elementos.pop(i)
                break
        else:
            raise RuntimeError(f"Inconsistencia interna: {ident} no está en su hoja.")
        self._registrar("eliminar", id=ident, x=x, y=y)
        for padre in reversed(camino[:-1]):
            if all(h.es_hoja() for h in padre.hijos) and \
                    sum(len(h.elementos) for h in padre.hijos) <= self.capacidad:
                padre.elementos = [e for h in padre.hijos for e in h.elementos]
                padre.hijos = None
                self._registrar("fusionar", nodo=padre.limites.a_lista())
            else:
                break
        return True

    # ------------------------------------------------------- actualizar posición
    def actualizar_posicion(self, elemento, nuevo_x: float, nuevo_y: float) -> None:
        """Mueve un elemento. Si sigue en la misma hoja solo se actualiza la
        coordenada; si cambia de hoja se elimina y se reinserta. O(profundidad)."""
        if elemento.id not in self._posiciones:
            raise KeyError(f"El elemento {elemento.id} no está en el Quadtree.")
        if not self.raiz.limites.contiene(nuevo_x, nuevo_y):
            raise ValueError("La nueva posición está fuera de los límites.")
        x, y = self._posiciones[elemento.id]
        hoja_actual, _ = self._hoja_de(x, y)
        hoja_nueva, _ = self._hoja_de(nuevo_x, nuevo_y)
        if hoja_actual is hoja_nueva:
            elemento.x, elemento.y = nuevo_x, nuevo_y
            self._posiciones[elemento.id] = (nuevo_x, nuevo_y)
            self._registrar("mover", id=elemento.id, x=nuevo_x, y=nuevo_y, misma_hoja=True)
            return
        self.eliminar(elemento)
        elemento.x, elemento.y = nuevo_x, nuevo_y
        self.insertar(elemento)

    # ----------------------------------------------------- buscar en rectángulo
    def buscar_en_rectangulo(self, rect: Rectangulo, filtro=None,
                             estadisticas: dict | None = None) -> list:
        """Devuelve los elementos dentro de `rect` (bordes incluidos).

        Solo desciende por los nodos cuyo rectángulo intersecta la consulta; los
        demás se DESCARTAN sin revisar sus elementos (poda). Si se pasa
        `estadisticas`, se registran nodos visitados/descartados.
        """
        resultado = []
        pila = [self.raiz]
        while pila:
            nodo = pila.pop()
            if not nodo.limites.intersecta(rect):
                if estadisticas is not None:
                    estadisticas.setdefault("descartados", []).append(nodo.limites.a_lista())
                continue
            if estadisticas is not None:
                estadisticas.setdefault("visitados", []).append(nodo.limites.a_lista())
                estadisticas["elementos_revisados"] = (
                    estadisticas.get("elementos_revisados", 0) + len(nodo.elementos))
            if nodo.es_hoja():
                for e in nodo.elementos:
                    if rect.contiene(e.x, e.y) and (filtro is None or filtro(e)):
                        resultado.append(e)
            else:
                pila.extend(nodo.hijos)
        return resultado

    # ----------------------------------------------------------- estadísticas
    def estadisticas(self) -> dict:
        nodos = hojas = prof = desbordadas = 0
        pila = [self.raiz]
        while pila:
            n = pila.pop()
            nodos += 1
            prof = max(prof, n.profundidad)
            if n.es_hoja():
                hojas += 1
                if len(n.elementos) > self.capacidad:
                    desbordadas += 1
            else:
                pila.extend(n.hijos)
        return {"nodos": nodos, "hojas": hojas, "profundidad": prof,
                "elementos": len(self), "capacidad": self.capacidad,
                "hojas_desbordadas": desbordadas}

    def a_lista_nodos(self, incluir_ids: bool = False) -> list[dict]:
        """Lista plana de nodos para dibujar el árbol en el frontend."""
        salida = []
        pila = [self.raiz]
        while pila:
            n = pila.pop()
            d = {"r": [round(v, 2) for v in n.limites.a_lista()],
                 "p": n.profundidad, "hoja": n.es_hoja(), "n": len(n.elementos)}
            if incluir_ids and n.es_hoja():
                d["ids"] = [e.id for e in n.elementos]
            salida.append(d)
            if not n.es_hoja():
                pila.extend(n.hijos)
        return salida

    def todos(self) -> list:
        return self.buscar_en_rectangulo(self.raiz.limites)
