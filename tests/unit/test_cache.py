"""
Unit-С‚РµСЃС‚С‹ in-memory РєСЌС€Р° РІРёРєС‚РѕСЂРёРЅ (cache.py).

РџРѕРєСЂС‹РІР°РµС‚: cache_quiz, get_cached_quiz, invalidate_quiz,
РёР·РѕР»СЏС†РёСЋ РїРѕ РєР»СЋС‡Р°Рј Рё РїРѕРІС‚РѕСЂРЅСѓСЋ РёРЅРІР°Р»РёРґР°С†РёСЋ.
"""

import allure

from backend.games.friends_game.cache import (
    cache_quiz,
    get_cached_quiz,
    invalidate_quiz,
    _quiz_cache,
)


@allure.feature("Cache")
@allure.story("Quiz Cache")
class TestCache:
    """РўРµСЃС‚С‹ РєСЌС€Р° РІРёРєС‚РѕСЂРёРЅ."""

    def setup_method(self):
        """РћС‡РёС‰Р°РµРј РєСЌС€ РїРµСЂРµРґ РєР°Р¶РґС‹Рј С‚РµСЃС‚РѕРј."""
        _quiz_cache.clear()

    @allure.title("РљСЌС€РёСЂРѕРІР°РЅРёРµ Рё РёР·РІР»РµС‡РµРЅРёРµ РґР°РЅРЅС‹С…")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_cache_and_retrieve(self):
        """cache_quiz в†’ get_cached_quiz РІРѕР·РІСЂР°С‰Р°РµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ."""
        with allure.step("РљСЌС€РёСЂСѓРµРј РІРёРєС‚РѕСЂРёРЅСѓ"):
            cache_quiz("PARTY-AAA", 1, [{"q": "test"}], 1)
        with allure.step("РР·РІР»РµРєР°РµРј РёР· РєСЌС€Р°"):
            cached = get_cached_quiz("PARTY-AAA")
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РєРѕСЂСЂРµРєС‚РЅРѕСЃС‚СЊ РґР°РЅРЅС‹С…"):
            assert cached is not None
            assert cached["id"] == 1
            assert cached["questions_data"] == [{"q": "test"}]
            assert cached["total_questions"] == 1

    @allure.title("РџСЂРѕРјР°С… РєСЌС€Р° вЂ” РѕС‚СЃСѓС‚СЃС‚РІСѓСЋС‰РёР№ РєР»СЋС‡")
    @allure.severity(allure.severity_level.NORMAL)
    def test_cache_miss(self):
        """get_cached_quiz РґР»СЏ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ РєРѕРґР° РІРѕР·РІСЂР°С‰Р°РµС‚ None."""
        assert get_cached_quiz("PARTY-NOPE") is None

    @allure.title("РРЅРІР°Р»РёРґР°С†РёСЏ СѓРґР°Р»СЏРµС‚ Р·Р°РїРёСЃСЊ РёР· РєСЌС€Р°")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_invalidate(self):
        """invalidate_quiz СѓРґР°Р»СЏРµС‚ СЂР°РЅРµРµ Р·Р°РєСЌС€РёСЂРѕРІР°РЅРЅСѓСЋ Р·Р°РїРёСЃСЊ."""
        with allure.step("РљСЌС€РёСЂСѓРµРј РІРёРєС‚РѕСЂРёРЅСѓ"):
            cache_quiz("PARTY-BBB", 2, [], 0)
            assert get_cached_quiz("PARTY-BBB") is not None
        with allure.step("РРЅРІР°Р»РёРґРёСЂСѓРµРј РєСЌС€"):
            invalidate_quiz("PARTY-BBB")
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ Р·Р°РїРёСЃСЊ СѓРґР°Р»РµРЅР°"):
            assert get_cached_quiz("PARTY-BBB") is None

    @allure.title("РРЅРІР°Р»РёРґР°С†РёСЏ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ РєР»СЋС‡Р° Р±РµР·РѕРїР°СЃРЅР°")
    @allure.severity(allure.severity_level.MINOR)
    def test_invalidate_nonexistent_is_safe(self):
        """РРЅРІР°Р»РёРґР°С†РёСЏ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ РєР»СЋС‡Р° РЅРµ РІС‹Р·С‹РІР°РµС‚ РѕС€РёР±РѕРє."""
        invalidate_quiz("PARTY-GHOST")  # no exception

    @allure.title("РџРµСЂРµР·Р°РїРёСЃСЊ РѕР±РЅРѕРІР»СЏРµС‚ РґР°РЅРЅС‹Рµ РІ РєСЌС€Рµ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_overwrite_cache(self):
        """РџРѕРІС‚РѕСЂРЅС‹Р№ cache_quiz РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµС‚ СЃС‚Р°СЂС‹Рµ РґР°РЅРЅС‹Рµ."""
        with allure.step("РљСЌС€РёСЂСѓРµРј СЃС‚Р°СЂС‹Рµ РґР°РЅРЅС‹Рµ"):
            cache_quiz("PARTY-CCC", 1, [{"old": True}], 1)
        with allure.step("РџРµСЂРµР·Р°РїРёСЃС‹РІР°РµРј РЅРѕРІС‹РјРё РґР°РЅРЅС‹РјРё"):
            cache_quiz("PARTY-CCC", 1, [{"new": True}], 2)
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј Р°РєС‚СѓР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ"):
            cached = get_cached_quiz("PARTY-CCC")
            assert cached["questions_data"] == [{"new": True}]
            assert cached["total_questions"] == 2

    @allure.title("РР·РѕР»СЏС†РёСЏ РјРµР¶РґСѓ РєРѕРјРЅР°С‚Р°РјРё")
    @allure.severity(allure.severity_level.NORMAL)
    def test_isolation_between_rooms(self):
        """РРЅРІР°Р»РёРґР°С†РёСЏ РѕРґРЅРѕР№ РєРѕРјРЅР°С‚С‹ РЅРµ Р·Р°С‚СЂР°РіРёРІР°РµС‚ РґСЂСѓРіСѓСЋ."""
        with allure.step("РљСЌС€РёСЂСѓРµРј РґРІРµ РєРѕРјРЅР°С‚С‹"):
            cache_quiz("PARTY-R1", 10, [], 0)
            cache_quiz("PARTY-R2", 20, [], 0)

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РѕР±Рµ РґРѕСЃС‚СѓРїРЅС‹"):
            assert get_cached_quiz("PARTY-R1")["id"] == 10
            assert get_cached_quiz("PARTY-R2")["id"] == 20

        with allure.step("РРЅРІР°Р»РёРґРёСЂСѓРµРј С‚РѕР»СЊРєРѕ R1"):
            invalidate_quiz("PARTY-R1")

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РёР·РѕР»СЏС†РёСЋ"):
            assert get_cached_quiz("PARTY-R1") is None
            assert get_cached_quiz("PARTY-R2") is not None

